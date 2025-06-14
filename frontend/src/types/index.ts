export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Participant {
  id: string;
  name: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  avatarUrl?: string;
  avatarColor?: string;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: number;
  isOwn: boolean;
}

export interface Room {
  id: string;
  name: string;
  participants: Participant[];
}

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

export interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
}

export interface VideoTileProps {
  stream: MediaStream;
  participant: Participant;
  isLocal: boolean;
}

export interface Meeting {
  id: string;
  title: string;
  createdBy: string;
  participants: string[];
  createdAt: Date;
  isActive: boolean;
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  timestamp: Date;
} 