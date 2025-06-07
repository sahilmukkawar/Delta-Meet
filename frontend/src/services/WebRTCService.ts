import { User } from '../types';

interface WebRTCServiceCallbacks {
  onParticipantJoined: (participant: { id: string; name: string }) => void;
  onParticipantLeft: (participantId: string) => void;
  onStreamReceived: (participantId: string, stream: MediaStream) => void;
}

export class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection>;
  private user: User;
  private meetingId: string;
  private callbacks: WebRTCServiceCallbacks;

  constructor(
    user: User,
    meetingId: string,
    onParticipantJoined: WebRTCServiceCallbacks['onParticipantJoined'],
    onParticipantLeft: WebRTCServiceCallbacks['onParticipantLeft'],
    onStreamReceived: WebRTCServiceCallbacks['onStreamReceived']
  ) {
    this.peerConnections = new Map();
    this.user = user;
    this.meetingId = meetingId;
    this.callbacks = {
      onParticipantJoined,
      onParticipantLeft,
      onStreamReceived
    };
  }

  async connect(localStream: MediaStream) {
    // Initialize WebRTC connection
    const ws = new WebSocket(`ws://localhost:8080/ws?meetingId=${this.meetingId}&userId=${this.user.id}`);

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'participant-joined':
          this.handleParticipantJoined(message.userId, message.userName);
          break;
        case 'participant-left':
          this.handleParticipantLeft(message.userId);
          break;
        case 'offer':
          await this.handleOffer(message.userId, message.sdp);
          break;
        case 'answer':
          await this.handleAnswer(message.userId, message.sdp);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(message.userId, message.candidate);
          break;
      }
    };

    // Add local stream tracks to peer connections
    localStream.getTracks().forEach(track => {
      this.peerConnections.forEach(pc => {
        pc.addTrack(track, localStream);
      });
    });
  }

  private async handleParticipantJoined(userId: string, userName: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate to signaling server
      }
    };

    pc.ontrack = (event) => {
      this.callbacks.onStreamReceived(userId, event.streams[0]);
    };

    this.peerConnections.set(userId, pc);
    this.callbacks.onParticipantJoined({ id: userId, name: userName });
  }

  private handleParticipantLeft(userId: string) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }
    this.callbacks.onParticipantLeft(userId);
  }

  private async handleOffer(userId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      // Send answer to signaling server
    }
  }

  private async handleAnswer(userId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  private async handleIceCandidate(userId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async replaceStream(newStream: MediaStream) {
    this.peerConnections.forEach(pc => {
      const senders = pc.getSenders();
      senders.forEach(sender => {
        if (sender.track) {
          const newTrack = newStream.getTracks().find(track => track.kind === sender.track?.kind);
          if (newTrack) {
            sender.replaceTrack(newTrack);
          }
        }
      });
    });
  }

  disconnect() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
  }
}

export default WebRTCService; 