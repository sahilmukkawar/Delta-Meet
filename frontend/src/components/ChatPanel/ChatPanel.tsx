import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User } from '../../types';
import './ChatPanel.css';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import TextField from '@mui/material/TextField';
import SendIcon from '@mui/icons-material/Send';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import ChatIcon from '@mui/icons-material/Chat';
import RefreshIcon from '@mui/icons-material/Refresh';
import { FixedSizeList as List } from 'react-window';
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: Date;
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
}

interface ChatPanelProps {
  meetingId: string;
  user: User;
  token: string;
  onClose: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ meetingId, user, token, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Load chat history function
  const loadChatHistory = useCallback(async (showLoading = true) => {
    if (showLoading) setHistoryLoading(true);
    
    try {
      console.log('Loading chat history for meeting:', meetingId);
      const response = await fetch(`http://localhost:8080/api/chat/${meetingId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Raw chat history response:', data);
      
      if (data.messages && Array.isArray(data.messages)) {
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg._id || msg.id,
          sender: {
            id: msg.user_id || msg.userId,
            name: msg.user_name || msg.userName,
            email: msg.user_email || msg.userEmail
          },
          content: msg.message || msg.data,
          timestamp: new Date(msg.timestamp)
        }));
        
        console.log('Formatted messages:', formattedMessages);
        
        if (mountedRef.current) {
          setMessages(formattedMessages);
          scrollToBottom();
        }
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      if (showLoading && mountedRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [meetingId, token, scrollToBottom]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }
  }, []);

  // Initialize WebSocket
  const initializeWebSocket = useCallback(() => {
    // Don't try to reconnect if we're already connected, connecting, or exceeded max attempts
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        connectingRef.current || 
        reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    // Cleanup existing connection first
    cleanup();
    connectingRef.current = true;

    const wsUrl = `ws://localhost:8080/api/ws?meetingId=${meetingId}&userId=${user.id}`;
    console.log('Connecting to WebSocket:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('WebSocket connection timeout');
        cleanup();
        connectingRef.current = false;
        setWsConnected(false);
      }
    }, 5000);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('WebSocket connected');
      setWsConnected(true);
      setReconnectAttempts(0);
      connectingRef.current = false;
      
      // Send authentication message
      const authMessage = {
        type: 'auth',
        token,
        meetingId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      };
      
      try {
        ws.send(JSON.stringify(authMessage));
      } catch (error) {
        console.error('Failed to send auth message:', error);
        cleanup();
        return;
      }

      // Load chat history when WebSocket connects
      loadChatHistory(false);
    };

    // Update the WebSocket message handler
    ws.onmessage = (event) => {
      if (!mountedRef.current) return;

      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat') {
          // Add message immediately without waiting for state updates
          const newMessage = {
            id: data.id || `temp-${Date.now()}`,
            sender: {
              id: data.user_id || data.userId,
              name: data.user_name || data.userName,
              email: data.user_email || data.userEmail
            },
            content: data.message || data.data,
            timestamp: new Date(data.timestamp)
          };

          // Use functional update to prevent race conditions
          setMessages(prev => {
            const isDuplicate = prev.some(msg => msg.id === newMessage.id);
            if (isDuplicate) return prev;
            
            return [...prev, newMessage].sort((a, b) => 
              a.timestamp.getTime() - b.timestamp.getTime()
            );
          });

          // Immediate scroll for better UX
          requestAnimationFrame(scrollToBottom);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log('WebSocket disconnected:', event.code, event.reason);
      
      if (mountedRef.current && event.code !== 1000) {
        setWsConnected(false);
        connectingRef.current = false;

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setReconnectAttempts(prev => prev + 1);
              initializeWebSocket();
            }
          }, delay);
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      cleanup();
    };

    // Keep-alive ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('Failed to send ping:', error);
          cleanup();
        }
      }
    }, 30000);

    // Cleanup ping interval on close
    ws.addEventListener('close', () => {
      clearInterval(pingInterval);
    });

  }, [meetingId, user, token, reconnectAttempts, cleanup, scrollToBottom]);

  // Initialize on component mount
  useEffect(() => {
    mountedRef.current = true;

    // Load initial messages then connect WebSocket
    loadChatHistory().then(() => {
      if (mountedRef.current) {
        initializeWebSocket();
      }
    });

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [meetingId, loadChatHistory, initializeWebSocket, cleanup]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Update sendMessage function to handle file uploads
  const sendMessage = async () => {
    if (!newMessage.trim() && !file) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setLoading(true);
    try {
      let fileUrl = '';
      let fileType = '';
      if (file) {
        const result = await uploadFile(file);
        fileUrl = result.url;
        fileType = result.type;
      }

      const message = {
        type: 'chat',
        data: newMessage,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        meetingId,
        timestamp: new Date().toISOString()
      };

      wsRef.current.send(JSON.stringify(message));
      setNewMessage('');
      setFile(null);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Manual refresh function
  const handleRefresh = () => {
    loadChatHistory();
  };

  const resetConnection = useCallback(() => {
    setReconnectAttempts(0);
    cleanup();
    initializeWebSocket();
  }, [cleanup, initializeWebSocket]);

  // Format time helper
  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Emoji picker logic
  const handleEmojiSelect = (emoji: any) => {
    setNewMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
    messageInputRef.current?.focus();
  };

  // File input logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // File upload logic (stub, to be implemented with backend)
  const uploadFile = async (file: File): Promise<{ url: string; type: string }> => {
    setFileUploading(true);
    // TODO: Implement actual upload logic (e.g., to backend or S3)
    // For now, just return a dummy URL
    await new Promise(res => setTimeout(res, 1000));
    setFileUploading(false);
    return { url: URL.createObjectURL(file), type: file.type };
  };

  // Update message rendering to display emoji and file previews
  const renderMessage = (message: ChatMessage) => {
    return (
      <Box key={message.id} className="chat-message">
        <Typography variant="subtitle2" color="textSecondary">
          {message.sender.name} • {formatTime(message.timestamp)}
        </Typography>
        <Typography variant="body1">{message.content}</Typography>
        {message.fileUrl && (
          <Box mt={1}>
            {message.fileType?.startsWith('image/') ? (
              <img
                src={message.fileUrl}
                alt="Shared file"
                style={{ maxWidth: '100%', maxHeight: '200px' }}
              />
            ) : (
              <a
                href={message.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#1a73e8' }}
              >
                {message.fileName || 'Download file'}
              </a>
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <div className="chat-panel-overlay">
      <div className="chat-panel">
        {/* Enhanced Header */}
        <div className="chat-header">
          <Box display="flex" alignItems="center" gap={1}>
            <ChatIcon sx={{ color: '#1a73e8' }} />
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 500 }}>
              Meeting Chat
            </Typography>
            <Chip
              icon={wsConnected ? <WifiIcon /> : <WifiOffIcon />}
              label={wsConnected ? 'Connected' : 'Offline'}
              size="small"
              color={wsConnected ? 'success' : 'error'}
              sx={{ ml: 1 }}
            />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <IconButton 
              onClick={() => {
                resetConnection();
                handleRefresh();
              }} 
              size="small" 
              sx={{ color: '#fff' }}
              disabled={historyLoading}
              title="Refresh chat history"
            >
              {historyLoading ? (
                <CircularProgress size={16} sx={{ color: '#fff' }} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
            <IconButton onClick={onClose} size="small" sx={{ color: '#fff' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </div>

        {/* Messages Container */}
        <div className="chat-messages">
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>

        {/* Connection Status Banner */}
        {!wsConnected && (
          <Box 
            sx={{ 
              bgcolor: 'error.dark', 
              px: 2, 
              py: 1, 
              borderTop: 1, 
              borderColor: 'error.main' 
            }}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <WifiOffIcon sx={{ color: 'error.light', fontSize: 16 }} />
              <Typography variant="caption" sx={{ color: 'error.light' }}>
                {reconnectAttempts > 0 
                  ? `Reconnecting... (${reconnectAttempts}/5)`
                  : 'Connection lost. Reconnecting...'
                }
              </Typography>
            </Box>
          </Box>
        )}

        {/* Enhanced Input Container */}
        <div className="chat-input-container">
          <Box display="flex" alignItems="center" gap={1}>
            <IconButton onClick={() => setShowEmojiPicker(val => !val)}>
              <InsertEmoticonIcon />
            </IconButton>
            {showEmojiPicker && (
              <Box position="absolute" bottom={56} left={8} zIndex={10}>
                <Picker onSelect={handleEmojiSelect} theme="light" />
              </Box>
            )}
            <input
              accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
              style={{ display: 'none' }}
              id="chat-file-input"
              type="file"
              onChange={handleFileChange}
            />
            <label htmlFor="chat-file-input">
              <IconButton component="span">
                <AttachFileIcon />
              </IconButton>
            </label>
            <TextField
              inputRef={messageInputRef}
              fullWidth
              variant="outlined"
              size="small"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={wsConnected ? "Type a message..." : "Reconnecting..."}
              disabled={loading || !wsConnected || fileUploading}
              multiline
              maxRows={3}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    {loading || fileUploading ? (
                      <CircularProgress size={20} sx={{ color: '#1a73e8' }} />
                    ) : (
                      <IconButton 
                        onClick={sendMessage} 
                        disabled={!newMessage.trim() || loading || !wsConnected || fileUploading}
                        sx={{ 
                          color: wsConnected && newMessage.trim() ? '#1a73e8' : 'rgba(255, 255, 255, 0.3)',
                          '&:hover': {
                            bgcolor: 'rgba(26, 115, 232, 0.1)'
                          }
                        }}
                      >
                        <SendIcon />
                      </IconButton>
                    )}
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                  '&.Mui-focused fieldset': { borderColor: '#1a73e8' },
                  '&.Mui-disabled': {
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.05)' }
                  }
                },
                '& .MuiInputBase-input': {
                  color: '#fff',
                },
                '& .MuiInputBase-input::placeholder': {
                  color: 'rgba(255, 255, 255, 0.6)',
                  opacity: 1,
                },
                '& .MuiInputBase-input.Mui-disabled': {
                  color: 'rgba(255, 255, 255, 0.3)',
                  WebkitTextFillColor: 'rgba(255, 255, 255, 0.3)',
                },
              }}
            />
          </Box>
          
          {/* Message Stats */}
          <Box 
            display="flex" 
            justifyContent="space-between" 
            alignItems="center" 
            sx={{ mt: 1, px: 1 }}
          >
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>
              {messages.length} messages
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>
              Press Enter to send
            </Typography>
          </Box>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;