import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
}

interface HomeProps {
  user: User;
  token: string;
  onLogout: () => void;
}

const Home: React.FC<HomeProps> = ({ user, token, onLogout }) => {
  const navigate = useNavigate();
  const [meetingTitle, setMeetingTitle] = useState('');
  const [joinMeetingId, setJoinMeetingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createMeeting = async () => {
    if (!meetingTitle.trim()) {
      setError('Please enter a meeting title');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        'http://localhost:8080/api/meeting',
        { title: meetingTitle },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const { meeting } = response.data;
      navigate(`/meeting/${meeting.meeting_id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  const joinMeeting = async () => {
    if (!joinMeetingId.trim()) {
      setError('Please enter a meeting ID');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(
        'http://localhost:8080/api/meeting/join',
        { meetingId: joinMeetingId },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      navigate(`/meeting/${joinMeetingId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to join meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-container">
      <header className="home-header">
        <h1>Google Meet Clone</h1>
        <div className="user-info">
          <span>Welcome, {user.name}!</span>
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="home-content">
        <div className="meeting-actions">
          <div className="action-card">
            <h3>Start a New Meeting</h3>
            {error && <div className="error-message">{error}</div>}
            <input
              type="text"
              placeholder="Meeting Title"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              className="meeting-input"
            />
            <button 
              onClick={createMeeting} 
              disabled={loading}
              className="action-btn create-btn"
            >
              {loading ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>

          <div className="action-card">
            <h3>Join a Meeting</h3>
            <input
              type="text"
              placeholder="Enter Meeting ID"
              value={joinMeetingId}
              onChange={(e) => setJoinMeetingId(e.target.value)}
              className="meeting-input"
            />
            <button 
              onClick={joinMeeting} 
              disabled={loading}
              className="action-btn join-btn"
            >
              {loading ? 'Joining...' : 'Join Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;