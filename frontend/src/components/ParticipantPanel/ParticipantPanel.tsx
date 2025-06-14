import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import './ParticipantPanel.css';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';

interface ParticipantPanelProps {
  meetingId: string;
  user: User;
  onClose: () => void;
}

interface Participant extends User {
  isMuted?: boolean;
  isVideoOff?: boolean;
}

const ParticipantPanel: React.FC<ParticipantPanelProps> = ({ meetingId, user, onClose }) => {
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    // Listen for participant updates
    const handleParticipantJoined = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'user-joined') {
        setParticipants(prev => {
          if (!prev.find(p => p.id === data.userId)) {
            return [...prev, {
              id: data.userId,
              name: data.userName,
              email: data.userEmail
            }];
          }
          return prev;
        });
      }
    };

    const handleParticipantLeft = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'user-left') {
        setParticipants(prev => prev.filter(p => p.id !== data.userId));
      }
    };

    // Add initial user
    setParticipants([{
      id: user.id,
      name: user.name,
      email: user.email
    }]);

    window.addEventListener('message', handleParticipantJoined);
    window.addEventListener('message', handleParticipantLeft);

    return () => {
      window.removeEventListener('message', handleParticipantJoined);
      window.removeEventListener('message', handleParticipantLeft);
    };
  }, [user]);

  return (
    <div className="participant-panel">
      <div className="participant-header">
        <h2>Participants ({participants.length})</h2>
        <IconButton onClick={onClose} size="small" sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
      </div>
      <div className="participants-list">
        {participants.map(participant => (
          <div key={participant.id} className="participant-item">
            <div className="participant-info">
              <PersonIcon className="participant-avatar" />
              <span className="participant-name">{participant.name}</span>
            </div>
            <div className="participant-controls">
              <IconButton size="small" sx={{ color: '#fff' }}>
                {participant.isMuted ? <MicOffIcon /> : <MicIcon />}
              </IconButton>
              <IconButton size="small" sx={{ color: '#fff' }}>
                {participant.isVideoOff ? <VideocamOffIcon /> : <VideocamIcon />}
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantPanel; 