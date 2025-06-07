import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import VideoGrid from '../components/VideoGrid/VideoGrid';
import ChatPanel from '../components/ChatPanel/ChatPanel';
import Controls from '../components/Controls/Controls';
import WebRTCService from '../services/WebRTCService';
import axios from 'axios';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PeopleIcon from '@mui/icons-material/People';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';

interface User {
  id: string;
  name: string;
  email: string;
}

interface MeetingProps {
  user: User;
  token: string;
}

interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
}

const Meeting: React.FC<MeetingProps> = ({ user, token }) => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState<any>(null);
  
  const webRTCServiceRef = useRef<WebRTCService | null>(null);

  useEffect(() => {
    initializeMeeting();
    return () => {
      cleanup();
    };
  }, [meetingId]);

  const initializeMeeting = async () => {
    try {
      // Get meeting info
      const response = await axios.get(
        `http://localhost:8080/api/meeting/${meetingId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setMeetingInfo(response.data.meeting);

      // Initialize WebRTC service
      webRTCServiceRef.current = new WebRTCService(
        user,
        meetingId!,
        onParticipantJoined,
        onParticipantLeft,
        onStreamReceived
      );

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      
      // Connect to WebRTC service
      await webRTCServiceRef.current.connect(stream);
      
    } catch (error) {
      console.error('Failed to initialize meeting:', error);
      navigate('/');
    }
  };

  const onParticipantJoined = (participant: Participant) => {
    setParticipants(prev => [...prev, participant]);
  };

  const onParticipantLeft = (participantId: string) => {
    setParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const onStreamReceived = (participantId: string, stream: MediaStream) => {
    setParticipants(prev => 
      prev.map(p => 
        p.id === participantId ? { ...p, stream } : p
      )
    );
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!webRTCServiceRef.current) return;

    try {
      if (isScreenSharing) {
        // Stop screen sharing and get camera back
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        setLocalStream(stream);
        await webRTCServiceRef.current.replaceStream(stream);
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        setLocalStream(screenStream);
        await webRTCServiceRef.current.replaceStream(screenStream);
        setIsScreenSharing(true);

        // Handle screen share end
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
      }
    } catch (error) {
      console.error('Screen sharing error:', error);
    }
  };

  const leaveMeeting = () => {
    cleanup();
    navigate('/');
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (webRTCServiceRef.current) {
      webRTCServiceRef.current.disconnect();
    }
  };

  if (!meetingInfo) {
    return <div className="loading">Loading meeting...</div>;
  }

  return (
    <div className="meeting-container">
      <AppBar position="fixed" color="default" elevation={2} sx={{ top: 0, left: 0, right: 0, background: 'rgba(32,33,36,0.98)', zIndex: 1200 }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 500 }}>
              {meetingInfo.title}
            </Typography>
            <Tooltip title="Copy meeting code">
              <IconButton size="small" onClick={() => navigator.clipboard.writeText(meetingId!)}>
                <ContentCopyIcon sx={{ color: '#fff' }} />
              </IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ color: '#bbb', ml: 1 }}>
              {meetingId}
            </Typography>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Tooltip title="Participants">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <PeopleIcon sx={{ color: '#fff' }} />
                <Typography variant="body2" sx={{ color: '#fff' }}>{participants.length + 1}</Typography>
              </div>
            </Tooltip>
            <Tooltip title={user.name}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: '#1a73e8', fontWeight: 600 }}>
                {user.name.charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>
          </div>
        </Toolbar>
      </AppBar>
      <div style={{ height: 64 }} />
      <div className="meeting-content">
        <div className={`video-section ${isChatOpen ? 'with-chat' : ''}`}>
          <VideoGrid 
            localStream={localStream}
            participants={participants}
            localUser={user}
          />
        </div>

        {isChatOpen && (
          <ChatPanel 
            meetingId={meetingId!}
            user={user}
            token={token}
            onClose={() => setIsChatOpen(false)}
          />
        )}
      </div>

      <Controls
        isVideoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        isScreenSharing={isScreenSharing}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
        onToggleScreenShare={toggleScreenShare}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onLeaveMeeting={leaveMeeting}
      />
    </div>
  );
};

export default Meeting;