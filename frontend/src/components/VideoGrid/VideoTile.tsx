import React, { useEffect, useRef } from 'react';
import { VideoTileProps } from '../../types';
import './VideoGrid.css';

const getInitial = (name: string) => name ? name.charAt(0).toUpperCase() : '?';

const VideoTile: React.FC<VideoTileProps> = ({ stream, participant, isLocal }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = !!stream;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="video-tile-video"
          style={isLocal ? { transform: 'scaleX(-1)' } : {}}
        />
      ) : (
        <div className="video-tile-avatar" style={{ background: participant.avatarColor || '#1a73e8' }}>
          {participant.avatarUrl ? (
            <img src={participant.avatarUrl} alt={participant.name} className="video-tile-avatar-img" />
          ) : (
            <span className="video-tile-initial">{getInitial(participant.name)}</span>
          )}
        </div>
      )}
      <div className="video-tile-name-row">
        {participant.isMuted && (
          <span className="material-icons video-tile-mic-off">mic_off</span>
        )}
        <span className="video-tile-name">{participant.name}</span>
      </div>
    </div>
  );
};

export default VideoTile; 