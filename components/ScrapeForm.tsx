'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';

import { CalendarEvent } from '@/lib/api/types';
import 'bootstrap/dist/css/bootstrap.min.css';
import { type SubmitHandler, useForm } from 'react-hook-form';

import styles from './shared.module.css';

type FormInputs = {
  url: string;
  preferIcs: boolean;
};

function ScrapeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [processingUrl, setProcessingUrl] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [icsContent, setIcsContent] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<FormInputs>({
    mode: 'onChange',
    defaultValues: {
      url: '',
      preferIcs: false,
    },
  });

  // Auto-scroll to bottom when new events are added
  useEffect(() => {
    if (events.length > 0) {
      const container = document.getElementById('events-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [events.length]);

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsLoading(true);
    setSubmitSuccess(false);
    setSubmitError('');
    setProcessingUrl(data.url);
    setEvents([]);
    setStatusMessage('Starting...');
    setIcsContent(null);

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: data.url,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');

        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const data = line.slice(6); // Remove 'data: ' prefix

          try {
            const update = JSON.parse(data);

            if (update.type === 'status') {
              setStatusMessage(update.data.message);
            } else if (update.type === 'event') {
              setEvents((prev) => [...prev, update.data]);
            } else if (update.type === 'complete') {
              console.log('📥 Received complete event:', update.data);
              console.log('ICS content length:', update.data.icsContent?.length || 0);

              setIcsContent(update.data.icsContent);
              setStatusMessage(`✅ Complete! Extracted ${update.data.events.length} events`);

              // Auto-download ICS if available
              if (update.data.icsContent) {
                console.log('💾 Downloading ICS file...');
                const blob = new Blob([update.data.icsContent], {
                  type: 'text/calendar;charset=utf-8',
                });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `events-${new Date().toISOString().split('T')[0]}.ics`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }

              setSubmitSuccess(true);
              setTimeout(() => {
                setSubmitSuccess(false);
              }, 5000);
            } else if (update.type === 'error') {
              throw new Error(update.data.message);
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
          }
        }
      }
    } catch (error) {
      setSubmitError('An error occurred while processing your request. Please try again.');
      console.error('Submission error:', error);
    } finally {
      setIsLoading(false);
      setProcessingUrl('');
    }
  };

  return (
    <>
      <div
        className="min-vh-100 d-flex align-items-start justify-content-center flex-column flex-lg-row"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          gap: '2rem',
        }}
      >
        <div
          className={`bg-white rounded-4 shadow-lg p-4 w-100 ${styles.cardHover}`}
          style={{
            maxWidth: '480px',
            animation: `${styles.floatUp} 0.5s ease-out`,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            className="d-flex align-items-center justify-content-center position-relative mx-auto mb-4"
            style={{ width: '120px', height: '120px' }}
          >
            {/*FIXME: add back more wiggle when mouseover / click */}
            <Image
              className={`d-block rounded-2 ${styles.mascotHover}`}
              style={{
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))',
                animation: `${styles.wiggle} 3s ease-in-out infinite`,
                transition: 'transform 0.3s ease',
              }}
              src="/octopus-mascot.png"
              alt="OctoAgenda Mascot - Friendly Octopus"
              width={120}
              height={120}
              priority
            />
            <div
              className="position-absolute"
              style={{
                top: '-10px',
                right: '-10px',
                fontSize: '1.5rem',
                animation: `${styles.bounce} 2s ease-in-out infinite`,
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
              }}
            >
              📅
            </div>
          </div>

          <h1 className="text-center text-dark fw-semibold mb-2" style={{ fontSize: '1.75rem' }}>
            📅{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              OctoAgenda
            </span>{' '}
            🐙
          </h1>

          <p className="text-center text-muted mb-2 fst-italic" style={{ fontSize: '0.95rem' }}>
            ⚠️ A work in progress.. some functionality may 💩 the 🛌.{' '}
          </p>

          <p className="text-center text-muted mb-4" style={{ fontSize: '0.95rem' }}>
            🎯 Transform any webpage into calendar events with AI magic ✨
          </p>

          {submitSuccess && (
            <div
              className="p-3 bg-success-subtle border border-success-subtle rounded-3 text-success-emphasis mb-3"
              style={{ animation: `${styles.slideDown} 0.3s ease` }}
            >
              🎉 Success! Your events have been added to your calendar! 📅✨
            </div>
          )}

          {submitError && (
            <div
              className="p-3 bg-danger-subtle border border-danger-subtle rounded-3 text-danger-emphasis mb-3"
              style={{ animation: `${styles.slideDown} 0.3s ease` }}
            >
              ⚠️ {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-3">
              <div className="form-floating position-relative">
                <input
                  type="url"
                  className={`form-control ${styles.floatingInput} ${errors.url ? 'is-invalid' : ''}`}
                  id="urlInput"
                  placeholder="https://example.com"
                  {...register('url', {
                    required: 'URL is required',
                    pattern: {
                      value:
                        /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,
                      message: 'Please enter a valid URL',
                    },
                  })}
                  aria-invalid={errors.url ? 'true' : 'false'}
                  aria-describedby="urlHelp"
                  disabled={isLoading}
                />
                <label
                  htmlFor="urlInput"
                  className="text-muted"
                  style={{ transition: 'all 0.3s ease' }}
                >
                  🌐 Event Page URL
                </label>

                {errors.url && (
                  <span
                    className="d-block text-danger mt-1"
                    style={{ fontSize: '0.875rem', animation: `${styles.shake} 0.3s ease` }}
                    role="alert"
                  >
                    {errors.url.message}
                  </span>
                )}

                {!errors.url && (
                  <small
                    id="urlHelp"
                    className="d-block text-muted mt-1"
                    style={{ fontSize: '0.875rem' }}
                  >
                    📝 Enter the URL of a page containing event information
                  </small>
                )}
              </div>
            </div>

            <div
              className={`d-flex align-items-center mb-3 p-3 bg-light rounded-3 ${styles.checkboxContainer}`}
              style={{ transition: 'background 0.3s ease' }}
            >
              <input
                type="checkbox"
                className="form-check-input me-3"
                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                id="icsCheck"
                {...register('preferIcs')}
                disabled={isLoading}
              />
              <label
                className="form-check-label m-0 text-dark"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                htmlFor="icsCheck"
              >
                📥 Export ICS file only
              </label>
            </div>

            <button
              type="submit"
              className={`btn btn-primary w-100 fw-medium rounded-3 position-relative overflow-hidden ${styles.btnHover}`}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1.1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                transition: 'all 0.3s ease',
              }}
              disabled={!isValid || isLoading}
            >
              {isLoading ? (
                <>
                  <span
                    className="d-inline-block me-2"
                    style={{
                      width: '1rem',
                      height: '1rem',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '50%',
                      borderTopColor: 'white',
                      animation: `${styles.spin} 0.6s linear infinite`,
                    }}
                  ></span>
                  🔄 Processing your events...
                </>
              ) : (
                '🚀 Extract Events & Add to Calendar 📅'
              )}
            </button>
          </form>
        </div>

        {(isLoading || events.length > 0) && (
          <div
            className="bg-white rounded-4 shadow-lg overflow-hidden w-100"
            style={{
              maxWidth: '800px',
              animation: `${styles.floatUp} 0.5s ease-out`,
            }}
          >
            <div
              className="p-4 text-center text-white"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              <h3 className="m-0 mb-2 fw-semibold" style={{ fontSize: '1.25rem' }}>
                📅 Extracted Events
              </h3>
              <div className="m-0" style={{ fontSize: '0.9rem', opacity: '0.9' }}>
                {statusMessage || '🔍 Analyzing page for calendar events...'}
              </div>
              <div className="mt-2 fw-semibold" style={{ fontSize: '1.1rem' }}>
                {events.length} event{events.length !== 1 ? 's' : ''} found
              </div>
            </div>

            <div
              className="p-4 bg-light"
              style={{
                height: '500px',
                overflowY: 'auto',
                scrollBehavior: 'smooth',
              }}
              id="events-container"
            >
              {events.length === 0 && isLoading && (
                <div className="d-flex flex-column align-items-center justify-content-center h-100">
                  <div
                    className="mb-3"
                    style={{
                      width: '3rem',
                      height: '3rem',
                      border: '4px solid rgba(102, 126, 234, 0.2)',
                      borderRadius: '50%',
                      borderTopColor: '#667eea',
                      animation: `${styles.spin} 1s linear infinite`,
                    }}
                  ></div>
                  <p className="m-0 fw-medium" style={{ color: '#667eea' }}>
                    Waiting for events...
                  </p>
                </div>
              )}

              {events.map((event, idx) => (
                <div
                  key={idx}
                  className="mb-3 p-3 bg-white rounded-3 shadow-sm"
                  style={{
                    animation: `${styles.slideDown} 0.3s ease`,
                    borderLeft: '4px solid #667eea',
                  }}
                >
                  <div className="fw-semibold mb-1" style={{ color: '#667eea', fontSize: '1rem' }}>
                    {event.title}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                    📍 {event.location}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                    🕒 {new Date(event.startTime).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ScrapeForm;
