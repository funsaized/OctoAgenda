import React from 'react';

import { CalendarEvent } from '@/lib/api/types';

import styles from './shared.module.css';

interface EventCardProps {
  event: CalendarEvent;
  index: number;
}

const EventCard: React.FC<EventCardProps> = ({ event, index }) => {
  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);

  // Format date components
  const day = startDate.getDate();
  const month = startDate.toLocaleDateString('en', { month: 'short' }).toUpperCase();

  // Format time
  const startTime = startDate.toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const endTime = endDate.toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Truncate description if too long
  const truncatedDescription =
    event.description.length > 120 ? event.description.slice(0, 120) + '...' : event.description;

  return (
    <div
      className={`card h-100 event-card position-relative overflow-hidden ${styles.cardHover}`}
      style={{
        animation: `${styles.floatUp} 0.5s ease-out ${index * 0.1}s both`,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Octopus Background */}
      <div
        className="position-absolute"
        style={{
          top: '10px',
          right: '10px',
          width: '60px',
          height: '60px',
          backgroundImage: `url('/octopus-mascot.png')`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.1,
          zIndex: 1,
        }}
      />

      {/* Calendar Date Header */}
      <div
        className="card-header text-center py-3 position-relative"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderBottom: 'none',
          zIndex: 2,
        }}
      >
        <div className="calendar-date">
          <div
            className="day fw-bold"
            style={{
              fontSize: '1.75rem',
              lineHeight: '1',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            }}
          >
            {day}
          </div>
          <div
            className="month fw-medium"
            style={{
              fontSize: '0.75rem',
              letterSpacing: '1px',
              opacity: 0.9,
            }}
          >
            {month}
          </div>
        </div>
      </div>

      {/* Event Content */}
      <div className="card-body d-flex flex-column position-relative" style={{ zIndex: 2 }}>
        <h5
          className="card-title fw-semibold mb-2"
          style={{
            color: '#2c3e50',
            fontSize: '1.1rem',
            lineHeight: '1.3',
          }}
        >
          {event.title}
        </h5>

        {/* Time Display */}
        <div
          className="event-time d-flex align-items-center mb-2"
          style={{
            color: '#667eea',
            fontSize: '0.9rem',
            fontWeight: '500',
          }}
        >
          <span className="me-1">🕐</span>
          {startTime}
          {startTime !== endTime && (
            <>
              <span className="mx-2">-</span>
              {endTime}
            </>
          )}
        </div>

        {/* Location */}
        {event.location && (
          <div
            className="event-location d-flex align-items-center mb-2"
            style={{
              color: '#6c757d',
              fontSize: '0.85rem',
            }}
          >
            <span className="me-1">📍</span>
            <span className="text-truncate">{event.location}</span>
          </div>
        )}

        {/* Description */}
        <p
          className="card-text flex-grow-1 mb-3"
          style={{
            fontSize: '0.875rem',
            color: '#495057',
            lineHeight: '1.4',
          }}
        >
          {truncatedDescription}
        </p>

        {/* Categories */}
        {event.categories && event.categories.length > 0 && (
          <div className="mb-2">
            {event.categories.slice(0, 2).map((category, i) => (
              <span
                key={i}
                className="badge me-1"
                style={{
                  backgroundColor: 'rgba(102, 126, 234, 0.1)',
                  color: '#667eea',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                }}
              >
                {category}
              </span>
            ))}
            {event.categories.length > 2 && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'rgba(102, 126, 234, 0.1)',
                  color: '#667eea',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                }}
              >
                +{event.categories.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {(event.organizer?.name || event.url) && (
        <div className="card-footer bg-light border-0 py-2 position-relative" style={{ zIndex: 2 }}>
          <div className="d-flex justify-content-between align-items-center">
            {event.organizer?.name && (
              <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                👤 {event.organizer.name}
              </small>
            )}
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
                style={{
                  fontSize: '0.7rem',
                  padding: '0.25rem 0.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  textDecoration: 'none',
                }}
              >
                Learn More
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventCard;
