import React, { useState } from 'react';
import { User } from '../../types';
import './MeetingControls.css';
import IconButton from '@mui/material/IconButton';
import PeopleIcon from '@mui/icons-material/People';
import ChatIcon from '@mui/icons-material/Chat';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ParticipantPanel from '../ParticipantPanel/ParticipantPanel';
import ChatPanel from '../ChatPanel/ChatPanel';

interface MeetingControlsProps {
  meetingId: string;
  user: User;
  token: string;
  onLeave: () => void;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleScreenShare: () => void;
  isScreenSharing: boolean;
}

const MeetingControls: React.FC<MeetingControlsProps> = ({
  meetingId,
  user,
  token,
  onLeave,
  onToggleMic,
  onToggleVideo,
  isMuted,
  isVideoOff,
  onToggleScreenShare,
  isScreenSharing,
}) => {
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      <div className="meeting-controls">
        <div className="controls-left">
          <IconButton
            onClick={onToggleMic}
            className={`control-button ${isMuted ? 'active' : ''}`}
            size="large"
          >
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
          <IconButton
            onClick={onToggleVideo}
            className={`control-button ${isVideoOff ? 'active' : ''}`}
            size="large"
          >
            {isVideoOff ? <VideocamOffIcon /> : <VideocamIcon />}
          </IconButton>
          <IconButton
            onClick={onToggleScreenShare}
            className={`control-button ${isScreenSharing ? 'active' : ''}`}
            size="large"
          >
            {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
          </IconButton>
        </div>

        <div className="controls-center">
          <IconButton
            onClick={onLeave}
            className="control-button leave-button"
            size="large"
          >
            <CallEndIcon />
          </IconButton>
        </div>

        <div className="controls-right">
          <IconButton
            onClick={() => setShowParticipants(!showParticipants)}
            className={`control-button ${showParticipants ? 'active' : ''}`}
            size="large"
          >
            <PeopleIcon />
          </IconButton>
          <IconButton
            onClick={() => setShowChat(!showChat)}
            className={`control-button ${showChat ? 'active' : ''}`}
            size="large"
          >
            <ChatIcon />
          </IconButton>
        </div>
      </div>

      {showParticipants && (
        <ParticipantPanel
          meetingId={meetingId}
          user={user}
          onClose={() => setShowParticipants(false)}
        />
      )}

      {showChat && (
        <ChatPanel
          meetingId={meetingId}
          user={user}
          token={token}
          onClose={() => setShowChat(false)}
        />
      )}
    </>
  );
};

export default MeetingControls; 