package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// Models
type User struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email     string             `bson:"email" json:"email"`
	Password  string             `bson:"password" json:"-"`
	Name      string             `bson:"name" json:"name"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}

type Meeting struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	MeetingID    string             `bson:"meeting_id" json:"meeting_id"`
	Title        string             `bson:"title" json:"title"`
	CreatedBy    primitive.ObjectID `bson:"created_by" json:"created_by"`
	Participants []string           `bson:"participants" json:"participants"`
	CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
	IsActive     bool               `bson:"is_active" json:"is_active"`
}

type ChatMessage struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	MeetingID string             `bson:"meeting_id" json:"meeting_id"`
	UserID    string             `bson:"user_id" json:"user_id"`
	UserName  string             `bson:"user_name" json:"user_name"`
	UserEmail string             `bson:"user_email" json:"user_email"`
	Message   string             `bson:"message" json:"message"`
	Timestamp time.Time          `bson:"timestamp" json:"timestamp"`
}

// Connection structure with better management
type Connection struct {
	ws         *websocket.Conn
	userID     string
	userName   string
	userEmail  string
	meetingID  string
	send       chan []byte
	mutex      sync.Mutex
	closed     bool
	sendClosed bool
	closeOnce  sync.Once
}

// Hub with improved connection management
type Hub struct {
	// meetingID -> userID -> connection
	meetings    map[string]map[string]*Connection
	register    chan *Connection
	unregister  chan *Connection
	broadcast   chan *BroadcastMessage
	mutex       sync.RWMutex
}

type BroadcastMessage struct {
	MeetingID     string
	Message       []byte
	ExcludeUserID string
	MessageType   string
}

type WebSocketMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	UserID    string      `json:"userId"`
	UserName  string      `json:"userName"`
	UserEmail string      `json:"userEmail"`
	MeetingID string      `json:"meetingId"`
	Timestamp string      `json:"timestamp"`
	ID        string      `json:"id,omitempty"`
}

// Global variables
var (
	db       *mongo.Database
	hub      *Hub
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			allowedOrigins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
			origin := r.Header.Get("Origin")
			for _, allowedOrigin := range allowedOrigins {
				if origin == allowedOrigin {
					return true
				}
			}
			return false
		},
		HandshakeTimeout: 10 * time.Second,
		ReadBufferSize:   4096,
		WriteBufferSize:  4096,
	}
	jwtSecret = []byte(os.Getenv("JWT_SECRET"))
)

// JWT Claims
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	jwt.RegisteredClaims
}

const (
	maxMessageSize = 1024 * 1024 // 1MB
	pongWait       = 60 * time.Second
	pingPeriod     = 45 * time.Second
	writeWait      = 10 * time.Second
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}

	// Set Gin mode based on environment
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize MongoDB with connection pooling
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		log.Fatal("MONGODB_URI environment variable is not set")
	}

	clientOptions := options.Client().
		ApplyURI(mongoURI).
		SetMaxPoolSize(100).
		SetMinPoolSize(10).
		SetMaxConnIdleTime(5 * time.Minute)

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	// Verify MongoDB connection
	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	db = client.Database(os.Getenv("MONGODB_DATABASE"))
	fmt.Println("Connected to MongoDB!")

	// Initialize WebSocket Hub
	hub = &Hub{
		meetings:   make(map[string]map[string]*Connection),
		register:   make(chan *Connection, 100),
		unregister: make(chan *Connection, 100),
		broadcast:  make(chan *BroadcastMessage, 1000),
	}
	go hub.run()

	// Start cleanup routine
	go hub.cleanupInactiveConnections()

	// Initialize Gin router
	r := gin.Default()
	
	// CORS configuration
	config := cors.DefaultConfig()
	config.AllowOrigins = strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Authorization"}
	config.AllowCredentials = true
	config.MaxAge = 12 * time.Hour
	r.Use(cors.New(config))

	// Add rate limiting middleware
	r.Use(rateLimitMiddleware())

	// Add logging middleware
	r.Use(loggingMiddleware())

	// Routes
	api := r.Group("/api")
	{
		api.POST("/register", registerHandler)
		api.POST("/login", loginHandler)
		api.POST("/meeting", authMiddleware(), createMeetingHandler)
		api.POST("/meeting/join", authMiddleware(), joinMeetingHandler)
		api.GET("/meeting/:id", authMiddleware(), getMeetingHandler)
		api.GET("/chat/:meetingId", authMiddleware(), getChatMessagesHandler)
		api.GET("/ws", wsHandler)
	}

	// Add recovery middleware
	r.Use(gin.Recovery())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server starting on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

// Rate limiting middleware
func rateLimitMiddleware() gin.HandlerFunc {
	limiter := make(map[string]int)
	var mutex sync.Mutex

	return func(c *gin.Context) {
		ip := c.ClientIP()
		mutex.Lock()
		limiter[ip]++
		count := limiter[ip]
		mutex.Unlock()

		if count > 100 { // 100 requests per minute
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Rate limit exceeded"})
			c.Abort()
			return
		}

		go func() {
			time.Sleep(time.Minute)
			mutex.Lock()
			limiter[ip]--
			mutex.Unlock()
		}()

		c.Next()
	}
}

// Logging middleware
func loggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		statusCode := c.Writer.Status()

		if raw != "" {
			path = path + "?" + raw
		}

		log.Printf("[GIN] %v | %3d | %13v | %15s | %-7s %#v",
			time.Now().Format("2006/01/02 - 15:04:05"),
			statusCode,
			latency,
			clientIP,
			method,
			path,
		)
	}
}

// Hub methods with improved connection management
func (h *Hub) run() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Hub panic recovered: %v", r)
		}
	}()

	for {
		select {
		case conn := <-h.register:
			h.handleRegister(conn)
		case conn := <-h.unregister:
			h.handleUnregister(conn)
		case msg := <-h.broadcast:
			h.handleBroadcast(msg)
		}
	}
}

func (h *Hub) handleRegister(conn *Connection) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	// Initialize meeting map if doesn't exist
	if h.meetings[conn.meetingID] == nil {
		h.meetings[conn.meetingID] = make(map[string]*Connection)
	}

	// Close existing connection for this user in this meeting
	if existingConn, exists := h.meetings[conn.meetingID][conn.userID]; exists {
		log.Printf("Closing existing connection for user %s in meeting %s", conn.userID, conn.meetingID)
		existingConn.safeClose()
		delete(h.meetings[conn.meetingID], conn.userID)
	}

	// Register new connection
	h.meetings[conn.meetingID][conn.userID] = conn
	
	log.Printf("User %s connected to meeting %s. Total connections in meeting: %d", 
		conn.userID, conn.meetingID, len(h.meetings[conn.meetingID]))
}

func (h *Hub) handleUnregister(conn *Connection) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if meetingConns, exists := h.meetings[conn.meetingID]; exists {
		if existingConn, userExists := meetingConns[conn.userID]; userExists && existingConn == conn {
			delete(meetingConns, conn.userID)
			conn.safeClose()
			
			// Clean up empty meeting
			if len(meetingConns) == 0 {
				delete(h.meetings, conn.meetingID)
				log.Printf("Meeting %s cleaned up (no active connections)", conn.meetingID)
			}
			
			log.Printf("User %s disconnected from meeting %s. Remaining connections: %d", 
				conn.userID, conn.meetingID, len(meetingConns))
		}
	}
}

func (h *Hub) handleBroadcast(msg *BroadcastMessage) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	if meetingConns, exists := h.meetings[msg.MeetingID]; exists {
		for userID, conn := range meetingConns {
			if userID != msg.ExcludeUserID {
				select {
				case conn.send <- msg.Message:
					// Message sent successfully
				default:
					// Connection send buffer is full, close it
					log.Printf("Send buffer full for user %s in meeting %s, closing connection", userID, msg.MeetingID)
					delete(meetingConns, userID)
					conn.safeClose()
				}
			}
		}
	}
}

func (h *Hub) cleanupInactiveConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		h.mutex.Lock()
		for meetingID, meetingConns := range h.meetings {
			for userID, conn := range meetingConns {
				// Check if connection is closed
				if conn.closed {
					log.Printf("Cleaning up closed connection for user %s in meeting %s", userID, meetingID)
					delete(meetingConns, userID)
					conn.safeClose()
				}
			}
			// Clean up empty meetings
			if len(meetingConns) == 0 {
				delete(h.meetings, meetingID)
			}
		}
		h.mutex.Unlock()
	}
}

// WebSocket Handlers
func wsHandler(c *gin.Context) {
	meetingID := c.Query("meetingId")
	userID := c.Query("userId")

	if meetingID == "" || userID == "" {
		c.JSON(400, gin.H{"error": "Missing meetingId or userId"})
		return
	}

	// Verify meeting exists
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	var meeting Meeting
	err := db.Collection("meetings").FindOne(ctx, bson.M{"meeting_id": meetingID}).Decode(&meeting)
	if err != nil {
		c.JSON(404, gin.H{"error": "Meeting not found"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	connection := &Connection{
		ws:        conn,
		userID:    userID,
		meetingID: meetingID,
		send:      make(chan []byte, 256),
	}

	// Start connection handlers
	go connection.writePump()
	go connection.readPump()
	
	// Register connection after starting handlers
	hub.register <- connection
}

// Connection methods
func (c *Connection) safeClose() {
	c.closeOnce.Do(func() {
		c.mutex.Lock()
		defer c.mutex.Unlock()

		if !c.closed {
			c.closed = true
			if !c.sendClosed {
				close(c.send)
				c.sendClosed = true
			}
			if c.ws != nil {
				c.ws.Close() // Safe close, no direct WriteMessage
			}
		}
	})
}

func (c *Connection) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.safeClose()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				// The hub closed the channel
				return
			}

			c.mutex.Lock()
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			w, err := c.ws.NextWriter(websocket.TextMessage)
			if err != nil {
				log.Printf("Error getting next writer: %v", err)
				c.mutex.Unlock()
				return
			}

			w.Write(message)

			// Add queued messages to the current websocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				log.Printf("Error closing writer: %v", err)
				c.mutex.Unlock()
				return
			}
			c.mutex.Unlock()

		case <-ticker.C:
			c.mutex.Lock()
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Error writing ping: %v", err)
				c.mutex.Unlock()
				return
			}
			c.mutex.Unlock()
		}
	}
}

func (c *Connection) readPump() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered in readPump: %v", r)
		}
		c.safeClose()
	}()

	c.ws.SetReadLimit(maxMessageSize)
	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Unexpected close error: %v", err)
			}
			break
		}

		// Reset read deadline after successful read
		c.ws.SetReadDeadline(time.Now().Add(pongWait))

		var msg WebSocketMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// Set user info from the message
		c.userID = msg.UserID
		c.userName = msg.UserName
		c.userEmail = msg.UserEmail
		c.meetingID = msg.MeetingID

		switch msg.Type {
		case "auth":
			c.handleAuth(msg)
		case "ping":
			c.handlePing()
		case "chat":
			c.handleChatMessage(msg)
		case "signaling":
			c.handleSignaling(msg)
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

func (c *Connection) handleAuth(msg WebSocketMessage) {
	c.mutex.Lock()
	c.userName = msg.UserName
	c.userEmail = msg.UserEmail
	c.mutex.Unlock()
	
	log.Printf("User %s authenticated in meeting %s", c.userID, c.meetingID)
	
	// Send confirmation
	response := WebSocketMessage{
		Type:      "auth-success",
		Timestamp: time.Now().Format(time.RFC3339),
	}
	c.sendMessage(response)
}

func (c *Connection) handlePing() {
	response := WebSocketMessage{
		Type:      "pong",
		Timestamp: time.Now().Format(time.RFC3339),
	}
	c.sendMessage(response)
}

func (c *Connection) handleChatMessage(msg WebSocketMessage) {
	messageContent, ok := msg.Data.(string)
	if !ok || strings.TrimSpace(messageContent) == "" {
		return
	}

	// Save message to database
	chatMsg := ChatMessage{
		MeetingID: c.meetingID,
		UserID:    c.userID,
		UserName:  c.userName,
		UserEmail: c.userEmail,
		Message:   strings.TrimSpace(messageContent),
		Timestamp: time.Now(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.Collection("chat_messages")
	result, err := collection.InsertOne(ctx, chatMsg)
	if err != nil {
		log.Printf("Error saving chat message: %v", err)
		return
	}

	chatMsg.ID = result.InsertedID.(primitive.ObjectID)

	// Create broadcast message with all necessary fields
	broadcastMsg := WebSocketMessage{
		Type:      "chat",
		Data:      messageContent,
		UserID:    c.userID,
		UserName:  c.userName,
		UserEmail: c.userEmail,
		MeetingID: c.meetingID,
		Timestamp: chatMsg.Timestamp.Format(time.RFC3339),
		ID:        chatMsg.ID.Hex(),
	}

	// Convert to JSON for broadcasting
	broadcastData, err := json.Marshal(broadcastMsg)
	if err != nil {
		log.Printf("Error marshaling broadcast message: %v", err)
		return
	}

	// Broadcast to all users in the meeting
	hub.broadcast <- &BroadcastMessage{
		MeetingID:     c.meetingID,
		Message:       broadcastData,
		ExcludeUserID: c.userID,
		MessageType:   "chat",
	}
}

func (c *Connection) handleSignaling(msg WebSocketMessage) {
	// Broadcast signaling message to all users in the meeting
	c.broadcastToMeeting(msg)
}

func (c *Connection) sendMessage(msg WebSocketMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message for user %s: %v", c.userID, err)
		return
	}

	select {
	case c.send <- data:
	default:
		log.Printf("Send buffer full for user %s", c.userID)
	}
}

func (c *Connection) broadcastToMeeting(msg WebSocketMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal broadcast message: %v", err)
		return
	}

	broadcastMsg := &BroadcastMessage{
		MeetingID:     c.meetingID,
		Message:       data,
		ExcludeUserID: c.userID,
		MessageType:   msg.Type,
	}

	select {
	case hub.broadcast <- broadcastMsg:
	default:
		log.Printf("Broadcast buffer full")
	}
}

// Auth Handlers (keeping existing ones)
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
		c.JSON(400, gin.H{"error": "Invalid request data"})
		return
	}

	if joinData.MeetingID == "" {
		c.JSON(400, gin.H{"error": "Meeting ID is required"})
		return
	}

	// Find meeting
	collection := db.Collection("meetings")
	var meeting Meeting
	err := collection.FindOne(context.Background(), bson.M{"meeting_id": joinData.MeetingID}).Decode(&meeting)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(404, gin.H{"error": "Meeting not found"})
		} else {
			c.JSON(500, gin.H{"error": "Failed to find meeting"})
		}
		return
	}

	// Check if meeting is active
	if !meeting.IsActive {
		c.JSON(400, gin.H{"error": "Meeting is no longer active"})
		return
	}

	// Add participant if not already present
	participantExists := false
	for _, participant := range meeting.Participants {
		if participant == claims.UserID {
			participantExists = true
			break
		}
	}

	if !participantExists {
		meeting.Participants = append(meeting.Participants, claims.UserID)
		_, err = collection.UpdateOne(
			context.Background(),
			bson.M{"meeting_id": joinData.MeetingID},
			bson.M{"$set": bson.M{"participants": meeting.Participants}},
		)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to update meeting participants"})
			return
		}
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
	
	if meetingID == "" {
		c.JSON(400, gin.H{"error": "Meeting ID is required"})
		return
	}

	collection := db.Collection("chat_messages")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	cursor, err := collection.Find(
		ctx,
		bson.M{"meeting_id": meetingID},
		options.Find().SetSort(bson.M{"timestamp": 1}),
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch messages"})
		return
	}
	defer cursor.Close(ctx)

	var messages []ChatMessage
	if err := cursor.All(ctx, &messages); err != nil {
		c.JSON(500, gin.H{"error": "Failed to decode messages"})
		return
	}

	c.JSON(200, gin.H{
		"messages": messages,
		"count":    len(messages),
	})
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