import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { Participant } from '../../types';
import Avatar from '@mui/material/Avatar';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import { Box, Tooltip, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import VideoTile from './VideoTile';

interface VideoGridProps {
  participants: Participant[];
  localStream: MediaStream | null;
  localUser: {
    id: string;
    name: string;
  };
  onPinParticipant?: (participantId: string) => void;
  pinnedParticipantId?: string | null;
}

const GridContainer = styled.div<{ $isPinned: boolean }>`
  display: grid;
  grid-template-columns: ${props => props.$isPinned ? '1fr 1fr' : 'repeat(auto-fit, minmax(300px, 1fr))'};
  gap: 1rem;
  padding: 1rem;
  height: calc(100vh - 100px);
  overflow-y: auto;
  background: #1a1a1a;
  transition: all 0.3s ease;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const VideoGrid: React.FC<VideoGridProps> = ({ 
  participants, 
  localStream, 
  localUser,
  onPinParticipant,
  pinnedParticipantId 
}) => {
  const sortedParticipants = useMemo(() => {
    const pinned = participants.find(p => p.id === pinnedParticipantId);
    const others = participants.filter(p => p.id !== pinnedParticipantId);
    return pinned ? [pinned, ...others] : participants;
  }, [participants, pinnedParticipantId]);

  return (
    <GridContainer $isPinned={!!pinnedParticipantId}>
      {localStream && (
        <VideoTile
          stream={localStream}
          participant={{
            id: localUser.id,
            name: localUser.name,
            stream: localStream,
            isMuted: false,
            isVideoOff: false
          }}
          isLocal={true}
        />
      )}
      {sortedParticipants.map(participant => 
        participant.stream ? (
          <VideoTile
            key={participant.id}
            stream={participant.stream}
            participant={participant}
            isLocal={false}
          />
        ) : null
      )}
    </GridContainer>
  );
};

export default VideoGrid;