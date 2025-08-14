'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useForm, type SubmitHandler } from 'react-hook-form';
import 'bootstrap/dist/css/bootstrap.min.css';

type FormInputs = {
  url: string;
  preferIcs: boolean;
};

function ScrapeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [processingUrl, setProcessingUrl] = useState('');

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

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsLoading(true);
    setSubmitSuccess(false);
    setSubmitError('');
    setProcessingUrl(data.url);
    const form = data;

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (form.preferIcs) {
        headers['Accept'] = 'text/calendar';
      }

      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: form.url,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      if (form.preferIcs) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `events-${new Date().toISOString().split('T')[0]}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const responseData = await res.json();
        console.log('Events extracted:', responseData);

        if (responseData.icsContent) {
          const blob = new Blob([responseData.icsContent], {
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
      }

      setSubmitSuccess(true);
      reset();

      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
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
      {/* Animation styles */}
      <style jsx>{`
        @keyframes floatUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes wiggle {
          0%,
          100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(-3deg) translateY(-2px);
          }
          75% {
            transform: rotate(3deg) translateY(-2px);
          }
        }

        @keyframes bounce {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-5px);
          }
          75% {
            transform: translateX(5px);
          }
        }

        .card-hover:hover {
          transform: translateY(-5px);
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.35) !important;
        }

        .mascot-hover:hover {
          transform: scale(1.1);
          animation: wiggleFast 0.5s ease-in-out infinite;
        }

        @keyframes wiggleFast {
          0%,
          100% {
            transform: scale(1.1) rotate(0deg);
          }
          25% {
            transform: scale(1.1) rotate(-5deg) translateY(-3px);
          }
          75% {
            transform: scale(1.1) rotate(5deg) translateY(-3px);
          }
        }

        .btn-hover:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .checkbox-container:hover {
          background-color: #e9ecef !important;
        }

        .floating-input:focus {
          border-color: #667eea !important;
          box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25) !important;
        }

        .floating-input {
          height: 3.5rem;
          padding-top: 1.625rem;
          padding-bottom: 0.625rem;
          transition: all 0.3s ease;
        }
      `}</style>

      <div
        className="min-vh-100 d-flex align-items-center justify-content-center flex-column flex-lg-row"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          gap: '2rem',
        }}
      >
        <div
          className="bg-white rounded-4 shadow-lg p-4 w-100 card-hover"
          style={{
            maxWidth: '480px',
            animation: 'floatUp 0.5s ease-out',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            className="d-flex align-items-center justify-content-center position-relative mx-auto mb-4"
            style={{ width: '120px', height: '120px' }}
          >
            <Image
              className="d-block rounded-2 mascot-hover"
              style={{
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))',
                animation: 'wiggle 3s ease-in-out infinite',
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
                animation: 'bounce 2s ease-in-out infinite',
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
              style={{ animation: 'slideDown 0.3s ease' }}
            >
              🎉 Success! Your events have been added to your calendar! 📅✨
            </div>
          )}

          {submitError && (
            <div
              className="p-3 bg-danger-subtle border border-danger-subtle rounded-3 text-danger-emphasis mb-3"
              style={{ animation: 'slideDown 0.3s ease' }}
            >
              ⚠️ {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-3">
              <div className="form-floating position-relative">
                <input
                  type="url"
                  className={`form-control floating-input ${errors.url ? 'is-invalid' : ''}`}
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
                    style={{ fontSize: '0.875rem', animation: 'shake 0.3s ease' }}
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
              className="d-flex align-items-center mb-3 p-3 bg-light rounded-3 checkbox-container"
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
                📥 Export as ICS file for calendar import
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 fw-medium rounded-3 position-relative overflow-hidden btn-hover"
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
                      animation: 'spin 0.6s linear infinite',
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

        {isLoading && processingUrl && (
          <div
            className="bg-white rounded-4 shadow-lg overflow-hidden w-100"
            style={{
              maxWidth: '800px',
              animation: 'floatUp 1s ease-out 1s both',
            }}
          >
            <div
              className="p-4 text-center text-white"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              <h3 className="m-0 mb-2 fw-semibold" style={{ fontSize: '1.25rem' }}>
                📖 Page Preview
              </h3>
              <div className="m-0" style={{ fontSize: '0.9rem', opacity: '0.9' }}>
                🔍 Analyzing this page for calendar events...
              </div>
            </div>

            <div className="position-relative bg-light" style={{ height: '400px' }}>
              <iframe
                src={processingUrl}
                className="w-100 h-100 border-0 bg-white"
                title="Website Preview"
                sandbox="allow-same-origin allow-scripts"
              />
              <div
                className="position-absolute top-0 start-0 end-0 bottom-0 d-flex flex-column align-items-center justify-content-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.45)',
                  backdropFilter: 'blur(2px)',
                }}
              >
                <div
                  className="mb-3"
                  style={{
                    width: '3rem',
                    height: '3rem',
                    border: '4px solid rgba(102, 126, 234, 0.2)',
                    borderRadius: '50%',
                    borderTopColor: '#667eea',
                    animation: 'spin 1s linear infinite',
                  }}
                ></div>
                <p className="m-0 fw-medium" style={{ color: '#667eea' }}>
                  🤖 AI is scanning for events...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ScrapeForm;
