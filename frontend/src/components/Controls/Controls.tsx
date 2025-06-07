import React from 'react';
import styled from 'styled-components';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CallEndIcon from '@mui/icons-material/CallEnd';
import PeopleIcon from '@mui/icons-material/People';

interface ControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeaveMeeting: () => void;
}

const ControlsBar = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  padding: 1rem 2rem;
  background: rgba(32, 33, 36, 0.95);
  border-radius: 2rem;
  position: fixed;
  left: 50%;
  bottom: 2rem;
  transform: translateX(-50%);
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
  z-index: 100;
`;

const Timer = styled.div`
  color: #bbb;
  font-size: 1rem;
  margin-right: 1.5rem;
`;

const ParticipantsButton = styled(IconButton)`
  color: #bbb;
`;

const EndCallButton = styled(IconButton)`
  background: #ea4335 !important;
  color: #fff !important;
  &:hover {
    background: #c62828 !important;
  }
`;

const Controls: React.FC<ControlsProps> = ({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onLeaveMeeting
}) => {
  return (
    <ControlsBar>
      <Timer>00:00</Timer>
      <Tooltip title="Participants">
        <ParticipantsButton>
          <PeopleIcon />
        </ParticipantsButton>
      </Tooltip>
      <Tooltip title={isAudioEnabled ? 'Mute' : 'Unmute'}>
        <IconButton onClick={onToggleAudio} color={isAudioEnabled ? 'primary' : 'default'}>
          {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
        </IconButton>
      </Tooltip>
      <Tooltip title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}>
        <IconButton onClick={onToggleVideo} color={isVideoEnabled ? 'primary' : 'default'}>
          {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
        </IconButton>
      </Tooltip>
      <Tooltip title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
        <IconButton onClick={onToggleScreenShare} color={isScreenSharing ? 'primary' : 'default'}>
          {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Chat">
        <IconButton onClick={onToggleChat}>
          <ChatIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="More options">
        <IconButton>
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Leave meeting">
        <EndCallButton onClick={onLeaveMeeting}>
          <CallEndIcon />
        </EndCallButton>
      </Tooltip>
    </ControlsBar>
  );
};

export default Controls;