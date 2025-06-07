import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Participant } from '../../types';
import Avatar from '@mui/material/Avatar';
import MicOffIcon from '@mui/icons-material/MicOff';

interface VideoGridProps {
  participants: Participant[];
  localStream: MediaStream | null;
  localUser: {
    id: string;
    name: string;
  };
}

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  isLocal?: boolean;
}

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  padding: 1rem;
  height: calc(100vh - 100px);
  overflow-y: auto;
`;

const VideoContainer = styled.div`
  position: relative;
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
`;

const Video = styled.div`
  width: 100%;
  height: 100%;
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const NamePill = styled.div`
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  background: rgba(32,33,36,0.85);
  color: #fff;
  padding: 4px 16px;
  border-radius: 16px;
  font-size: 1rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
`;

const MuteIcon = styled(MicOffIcon)`
  color: #ea4335;
  font-size: 1.2rem;
`;

const VideoTile: React.FC<VideoTileProps & { isMuted?: boolean; avatarUrl?: string; }> = ({ stream, name, isLocal, isMuted, avatarUrl }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <VideoContainer>
      <Video>
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            style={isLocal ? { transform: 'scaleX(-1)' } : {}}
          />
        ) : (
          <Avatar sx={{ width: 80, height: 80, bgcolor: '#1a73e8', fontSize: 36, fontWeight: 600, margin: 'auto' }} src={avatarUrl}>
            {name.charAt(0).toUpperCase()}
          </Avatar>
        )}
      </Video>
      <NamePill>
        {isMuted && <MuteIcon />}
        {name}{isLocal ? ' (You)' : ''}
      </NamePill>
    </VideoContainer>
  );
};

const VideoGrid: React.FC<VideoGridProps> = ({ participants, localStream, localUser }) => {
  return (
    <GridContainer>
      <VideoTile
        stream={localStream}
        name={localUser.name}
        isLocal={true}
        isMuted={false}
      />
      {participants.map((participant) => (
        <VideoTile
          key={participant.id}
          stream={participant.stream || null}
          name={participant.name}
          isMuted={participant.isMuted}
          avatarUrl={participant.avatarUrl}
        />
      ))}
    </GridContainer>
  );
};

export default VideoGrid;