export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  avatarColor?: string;
  avatarUrl?: string;
  isMuted?: boolean;
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

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  timestamp: Date;
} 