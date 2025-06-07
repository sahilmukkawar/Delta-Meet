package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// Models
type User struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email    string            `bson:"email" json:"email"`
	Password string            `bson:"password" json:"-"`
	Name     string            `bson:"name" json:"name"`
	CreatedAt time.Time        `bson:"created_at" json:"created_at"`
}

type Meeting struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	MeetingID   string            `bson:"meeting_id" json:"meeting_id"`
	Title       string            `bson:"title" json:"title"`
	CreatedBy   primitive.ObjectID `bson:"created_by" json:"created_by"`
	Participants []string          `bson:"participants" json:"participants"`
	CreatedAt   time.Time         `bson:"created_at" json:"created_at"`
	IsActive    bool              `bson:"is_active" json:"is_active"`
}

type ChatMessage struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	MeetingID string            `bson:"meeting_id" json:"meeting_id"`
	UserID    string            `bson:"user_id" json:"user_id"`
	UserName  string            `bson:"user_name" json:"user_name"`
	Message   string            `bson:"message" json:"message"`
	Timestamp time.Time         `bson:"timestamp" json:"timestamp"`
}

// WebSocket connection structure
type Connection struct {
	ws       *websocket.Conn
	userID   string
	userName string
	meetingID string
}

// Hub maintains the set of active connections and broadcasts messages
type Hub struct {
	connections map[string]*Connection
	broadcast   chan []byte
	register    chan *Connection
	unregister  chan *Connection
	mutex       sync.RWMutex
}

type SignalingMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	UserID    string      `json:"userId"`
	UserName  string      `json:"userName"`
	MeetingID string      `json:"meetingId"`
}

// Global variables
var (
	db       *mongo.Database
	hub      *Hub
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	jwtSecret = []byte("your-secret-key")
)

// JWT Claims
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	jwt.RegisteredClaims
}

func main() {
	// Initialize MongoDB
	initMongoDB()
	
	// Initialize WebSocket Hub
	hub = &Hub{
		connections: make(map[string]*Connection),
		broadcast:   make(chan []byte),
		register:    make(chan *Connection),
		unregister:  make(chan *Connection),
	}
	go hub.run()

	// Initialize Gin router
	r := gin.Default()
	
	// CORS configuration
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	r.Use(cors.New(config))

	// Routes
	api := r.Group("/api")
	{
		// Auth routes
		api.POST("/register", registerHandler)
		api.POST("/login", loginHandler)
		
		// Meeting routes
		api.POST("/meeting", authMiddleware(), createMeetingHandler)
		api.POST("/meeting/join", authMiddleware(), joinMeetingHandler)
		api.GET("/meeting/:id", authMiddleware(), getMeetingHandler)
		
		// Chat routes
		api.GET("/chat/:meetingId", authMiddleware(), getChatMessagesHandler)
		
		// WebSocket route
		api.GET("/ws", wsHandler)
	}

	fmt.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}

func initMongoDB() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI("mongodb+srv://mukkawarsahil99:e2sqKmvN07qUMfhG@cluster0.bayih5k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"))
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	// Test connection
	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	db = client.Database("googlemeet")
	fmt.Println("Connected to MongoDB!")
}

// Auth Handlers
func registerHandler(c *gin.Context) {
	var user User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to hash password"})
		return
	}

	user.Password = string(hashedPassword)
	user.CreatedAt = time.Now()

	// Insert user
	collection := db.Collection("users")
	result, err := collection.InsertOne(context.Background(), user)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create user"})
		return
	}

	user.ID = result.InsertedID.(primitive.ObjectID)
	
	// Generate JWT token
	token, err := generateJWT(user.ID.Hex(), user.Email, user.Name)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(201, gin.H{
		"message": "User created successfully",
		"token":   token,
		"user":    user,
	})
}

func loginHandler(c *gin.Context) {
	var loginData struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&loginData); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Find user
	collection := db.Collection("users")
	var user User
	err := collection.FindOne(context.Background(), bson.M{"email": loginData.Email}).Decode(&user)
	if err != nil {
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	// Check password
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(loginData.Password))
	if err != nil {
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	// Generate JWT token
	token, err := generateJWT(user.ID.Hex(), user.Email, user.Name)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(200, gin.H{
		"message": "Login successful",
		"token":   token,
		"user":    user,
	})
}

// Meeting Handlers
func createMeetingHandler(c *gin.Context) {
	claims := c.MustGet("claims").(*Claims)
	
	var meetingData struct {
		Title string `json:"title"`
	}

	if err := c.ShouldBindJSON(&meetingData); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Generate meeting ID
	meetingID := generateMeetingID()
	
	userID, _ := primitive.ObjectIDFromHex(claims.UserID)
	meeting := Meeting{
		MeetingID:    meetingID,
		Title:        meetingData.Title,
		CreatedBy:    userID,
		Participants: []string{claims.Name},
		CreatedAt:    time.Now(),
		IsActive:     true,
	}

	collection := db.Collection("meetings")
	result, err := collection.InsertOne(context.Background(), meeting)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create meeting"})
		return
	}

	meeting.ID = result.InsertedID.(primitive.ObjectID)

	c.JSON(201, gin.H{
		"message": "Meeting created successfully",
		"meeting": meeting,
	})
}

func joinMeetingHandler(c *gin.Context) {
	claims := c.MustGet("claims").(*Claims)
	
	var joinData struct {
		MeetingID string `json:"meetingId"`
	}

	if err := c.ShouldBindJSON(&joinData); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Find meeting
	collection := db.Collection("meetings")
	var meeting Meeting
	err := collection.FindOne(context.Background(), bson.M{"meeting_id": joinData.MeetingID}).Decode(&meeting)
	if err != nil {
		c.JSON(404, gin.H{"error": "Meeting not found"})
		return
	}

	// Add participant if not already present
	participantExists := false
	for _, participant := range meeting.Participants {
		if participant == claims.Name {
			participantExists = true
			break
		}
	}

	if !participantExists {
		meeting.Participants = append(meeting.Participants, claims.Name)
		collection.UpdateOne(
			context.Background(),
			bson.M{"meeting_id": joinData.MeetingID},
			bson.M{"$set": bson.M{"participants": meeting.Participants}},
		)
	}

	c.JSON(200, gin.H{
		"message": "Joined meeting successfully",
		"meeting": meeting,
	})
}

func getMeetingHandler(c *gin.Context) {
	meetingID := c.Param("id")

	collection := db.Collection("meetings")
	var meeting Meeting
	err := collection.FindOne(context.Background(), bson.M{"meeting_id": meetingID}).Decode(&meeting)
	if err != nil {
		c.JSON(404, gin.H{"error": "Meeting not found"})
		return
	}

	c.JSON(200, gin.H{"meeting": meeting})
}

func getChatMessagesHandler(c *gin.Context) {
	meetingID := c.Param("meetingId")

	collection := db.Collection("chat_messages")
	cursor, err := collection.Find(
		context.Background(),
		bson.M{"meeting_id": meetingID},
		options.Find().SetSort(bson.M{"timestamp": 1}),
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch messages"})
		return
	}
	defer cursor.Close(context.Background())

	var messages []ChatMessage
	if err := cursor.All(context.Background(), &messages); err != nil {
		c.JSON(500, gin.H{"error": "Failed to decode messages"})
		return
	}

	c.JSON(200, gin.H{"messages": messages})
}

// WebSocket Handlers
func wsHandler(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	connection := &Connection{
		ws: conn,
	}

	hub.register <- connection

	go connection.writePump()
	go connection.readPump()
}

func (c *Connection) readPump() {
	defer func() {
		hub.unregister <- c
		c.ws.Close()
	}()

	for {
		var msg SignalingMessage
		err := c.ws.ReadJSON(&msg)
		if err != nil {
			log.Println("WebSocket read error:", err)
			break
		}

		c.userID = msg.UserID
		c.userName = msg.UserName
		c.meetingID = msg.MeetingID

		switch msg.Type {
		case "chat":
			c.handleChatMessage(msg)
		case "offer", "answer", "ice-candidate":
			c.handleSignalingMessage(msg)
		case "user-joined", "user-left":
			c.broadcastToRoom(msg)
		}
	}
}

func (c *Connection) writePump() {
	defer c.ws.Close()

	for {
		select {
		case message, ok := <-hub.broadcast:
			if !ok {
				c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.ws.WriteMessage(websocket.TextMessage, message)
		}
	}
}

func (c *Connection) handleChatMessage(msg SignalingMessage) {
	// Save to database
	chatMsg := ChatMessage{
		MeetingID: msg.MeetingID,
		UserID:    msg.UserID,
		UserName:  msg.UserName,
		Message:   msg.Data.(string),
		Timestamp: time.Now(),
	}

	collection := db.Collection("chat_messages")
	collection.InsertOne(context.Background(), chatMsg)

	// Broadcast to room
	c.broadcastToRoom(msg)
}

func (c *Connection) handleSignalingMessage(msg SignalingMessage) {
	c.broadcastToRoom(msg)
}

func (c *Connection) broadcastToRoom(msg SignalingMessage) {
	hub.mutex.RLock()
	defer hub.mutex.RUnlock()

	messageData, _ := json.Marshal(msg)
	
	for _, conn := range hub.connections {
		if conn.meetingID == msg.MeetingID && conn != c {
			select {
			case hub.broadcast <- messageData:
			default:
				close(hub.broadcast)
				delete(hub.connections, conn.userID)
			}
		}
	}
}

func (h *Hub) run() {
	for {
		select {
		case connection := <-h.register:
			h.mutex.Lock()
			h.connections[connection.userID] = connection
			h.mutex.Unlock()

		case connection := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.connections[connection.userID]; ok {
				delete(h.connections, connection.userID)
			}
			h.mutex.Unlock()
		}
	}
}

// Middleware
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			c.JSON(401, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Remove "Bearer " prefix
		if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
			tokenString = tokenString[7:]
		}

		token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(401, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		claims := token.Claims.(*Claims)
		c.Set("claims", claims)
		c.Next()
	}
}

// Helper functions
func generateJWT(userID, email, name string) (string, error) {
	claims := &Claims{
		UserID: userID,
		Email:  email,
		Name:   name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func generateMeetingID() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, 10)
	for i := range result {
		result[i] = chars[time.Now().UnixNano()%int64(len(chars))]
	}
	return string(result)
}