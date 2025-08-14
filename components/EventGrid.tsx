import React from 'react';

import { CalendarEvent } from '@/lib/api/types';

import EventCard from './EventCard';

interface EventGridProps {
  events: CalendarEvent[];
}

const EventGrid: React.FC<EventGridProps> = ({ events }) => {
  if (events.length === 0) {
    return null;
  }

  return (
    <div
      className="bg-white rounded-4 shadow-lg p-4 w-100"
      style={{
        animation: 'floatUp 0.5s ease-out 0.3s both',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        maxWidth: '1200px',
      }}
    >
      {/* Header */}
      <div className="mb-4 text-center">
        <h3 className="fw-semibold mb-2">
          🎯{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontSize: '1.5rem',
            }}
          >
            {' '}
            Extracted Events
          </span>
        </h3>
        <p className="text-muted mb-0" style={{ fontSize: '0.95rem' }}>
          Found {events.length} event{events.length !== 1 ? 's' : ''} ready for your calendar 📅
        </p>
      </div>

      {/* Event Cards Grid */}
      <div className="row row-cols-1 row-cols-sm-2 row-cols-md-2 row-cols-lg-3 g-4">
        {events.map((event, index) => (
          <div className="col" key={event.uid || index}>
            <EventCard event={event} index={index} />
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="mt-4 pt-3 border-top text-center">
        <p className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>
          💡 Events are ready to be added to your calendar! Use the export option above.
        </p>

        {events.length > 0 && (
          <div className="d-flex flex-wrap gap-2 justify-content-center">
            <span className="badge bg-light text-dark" style={{ fontSize: '0.75rem' }}>
              📊 {events.length} Total Events
            </span>
            <span className="badge bg-light text-dark" style={{ fontSize: '0.75rem' }}>
              📍 {new Set(events.map((e) => e.location).filter(Boolean)).size} Unique Locations
            </span>
            <span className="badge bg-light text-dark" style={{ fontSize: '0.75rem' }}>
              👤 {new Set(events.map((e) => e.organizer?.name).filter(Boolean)).size} Organizers
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventGrid;
