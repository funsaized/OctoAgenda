'use client';

import React, { useState } from 'react';
import Image from "next/image";
import { useForm, SubmitHandler } from 'react-hook-form';
import styles from './ScrapeForm.module.css';

type FormInputs = {
  url: string;
  preferIcs: boolean;
};

function ScrapeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    clearErrors
  } = useForm<FormInputs>({
    mode: 'onChange',
    defaultValues: {
      url: '',
      preferIcs: false
    }
  });

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsLoading(true);
    setSubmitSuccess(false);
    setSubmitError('');
    const form = data;

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: form.url,
          preferIcs: form.preferIcs
        })
      });

      if (!res.ok) {
         throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data: string = await res.json();
      console.warn('GOT data from backend response', data);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('Form submitted:', data);

      // Success handling
      setSubmitSuccess(true);
      reset();

      // Clear success message after 5 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);

    } catch (error) {
      setSubmitError('An error occurred while processing your request. Please try again.');
      console.error('Submission error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="OctoAgenda Logo"
          width={180}
          height={38}
          priority
        />

        <h1 className={styles.title}>OctoAgenda</h1>
        <p className={`${styles.subtitle} mb-2 fst-italic`}>⚠️ A work in progress.. some functionality 💩 the 🛌. </p>
        <p className={`${styles.subtitle}`}>Transform any webpage into calendar events with AI magic</p>

        {submitSuccess && (
          <div className={styles.successMessage}>
            ✅ Success! Your events have been processed.
          </div>
        )}

        {submitError && (
          <div className={styles.errorAlert}>
            ⚠️ {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.formGroup}>
            <div className={`form-floating ${styles.floatingLabel}`}>
              <input
                type="url"
                className={`form-control ${errors.url ? 'is-invalid' : ''}`}
                id="urlInput"
                placeholder="https://example.com"
                {...register('url', {
                  required: 'URL is required',
                  pattern: {
                    value: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
                    message: 'Please enter a valid URL'
                  }
                })}
                aria-invalid={errors.url ? 'true' : 'false'}
                aria-describedby="urlHelp"
                disabled={isLoading}
              />
              <label htmlFor="urlInput">Event Page URL</label>
              {errors.url && (
                <span className={styles.errorMessage} role="alert">
                  {errors.url.message}
                </span>
              )}
              {!errors.url && (
                <small id="urlHelp" className={styles.helpText}>
                  Enter the URL of a page containing event information
                </small>
              )}
            </div>
          </div>

          <div className={styles.checkboxContainer}>
            <input
              type="checkbox"
              className={`form-check-input ${styles.checkbox}`}
              id="icsCheck"
              {...register('preferIcs')}
              disabled={isLoading}
            />
            <label className={`form-check-label ${styles.checkboxLabel}`} htmlFor="icsCheck">
              Export as ICS file for calendar import
            </label>
          </div>

          <button
            type="submit"
            className={`btn btn-primary ${styles.submitButton}`}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner}></span>
                Processing...
              </>
            ) : (
              'Extract Events 🚀'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ScrapeForm;
