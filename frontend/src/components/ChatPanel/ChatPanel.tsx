import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import './ChatPanel.css';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import TextField from '@mui/material/TextField';
import SendIcon from '@mui/icons-material/Send';
import InputAdornment from '@mui/material/InputAdornment';

interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: Date;
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
  const [wsConnected, setWsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const ws = new WebSocket(`ws://${window.location.hostname}:8080/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      // Send authentication and meeting info
      ws.send(JSON.stringify({
        type: 'auth',
        token,
        meetingId,
        userId: user.id,
        userName: user.name
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        setMessages(prev => [...prev, {
          id: data.id,
          sender: {
            id: data.userId,
            name: data.userName,
            email: data.userEmail || user.email
          },
          content: data.message,
          timestamp: new Date(data.timestamp)
        }]);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
      // Try to reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          console.log('Attempting to reconnect...');
          const newWs = new WebSocket(`ws://${window.location.hostname}:8080/api/ws`);
          wsRef.current = newWs;
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [meetingId, token, user]);

  useEffect(() => {
    loadChatHistory();
  }, [meetingId, token]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      const response = await fetch(`/api/chat/${meetingId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to load chat history');
      }
      const data = await response.json();
      setMessages(data.messages.map((msg: any) => ({
        id: msg.id,
        sender: {
          id: msg.userId,
          name: msg.userName
        },
        content: msg.message,
        timestamp: new Date(msg.timestamp)
      })));
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || loading || !wsConnected) return;

    setLoading(true);
    try {
      // Send message through WebSocket
      wsRef.current?.send(JSON.stringify({
        type: 'message',
        message: newMessage,
        meetingId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      }));
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-panel" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.18)', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }}>
      <div className="chat-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: '1px solid #222' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>Meeting Chat</h2>
        <IconButton onClick={onClose} size="small" sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
      </div>
      <div className="messages-container">
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`message ${message.sender.id === user.id ? 'sent' : ''}`}
          >
            <div className="message-info">
              <span className="message-sender">{message.sender.name}</span>
              <span className="message-time">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{message.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-container" style={{ padding: 16, borderTop: '1px solid #222', background: 'rgba(32,33,36,0.98)' }}>
        <TextField
          fullWidth
          variant="outlined"
          size="small"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={loading || !wsConnected}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={sendMessage} disabled={loading || !wsConnected}>
                  <SendIcon />
                </IconButton>
              </InputAdornment>
            ),
            sx: { background: '#222', color: '#fff', borderRadius: 2 }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#fff',
              background: '#222',
              borderRadius: 2,
              '& fieldset': { borderColor: '#444' },
              '&:hover fieldset': { borderColor: '#888' },
              '&.Mui-focused fieldset': { borderColor: '#1a73e8' },
            },
            input: { color: '#fff' },
          }}
        />
        {!wsConnected && (
          <div className="error-message" style={{ color: '#ea4335', marginTop: 8 }}>Chat connection lost. Reconnecting...</div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel; 