"use client"

import { useState } from "react"
import Image from "next/image"
import { useForm, type SubmitHandler } from "react-hook-form"
import styles from "./ScrapeForm.module.css"

type FormInputs = {
  url: string
  preferIcs: boolean
}

function ScrapeForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [processingUrl, setProcessingUrl] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    clearErrors,
    watch,
  } = useForm<FormInputs>({
    mode: "onChange",
    defaultValues: {
      url: "",
      preferIcs: false,
    },
  })

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsLoading(true)
    setSubmitSuccess(false)
    setSubmitError("")
    setProcessingUrl(data.url)
    const form = data

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      }

      if (form.preferIcs) {
        headers["Accept"] = "text/calendar"
      }

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: form.url,
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      if (form.preferIcs) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `events-${new Date().toISOString().split("T")[0]}.ics`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } else {
        const responseData = await res.json()
        console.log("Events extracted:", responseData)

        if (responseData.icsContent) {
          const blob = new Blob([responseData.icsContent], { type: "text/calendar;charset=utf-8" })
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `events-${new Date().toISOString().split("T")[0]}.ics`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
        }
      }

      setSubmitSuccess(true)
      reset()

      setTimeout(() => {
        setSubmitSuccess(false)
      }, 5000)
    } catch (error) {
      setSubmitError("An error occurred while processing your request. Please try again.")
      console.error("Submission error:", error)
    } finally {
      setIsLoading(false)
      setProcessingUrl("")
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.mascotContainer}>
          <Image
            className={styles.mascot}
            src="/octopus-mascot.png"
            alt="OctoAgenda Mascot - Friendly Octopus"
            width={120}
            height={120}
            priority
          />
          <div className={styles.calendarIcon}>📅</div>
        </div>

        <h1 className={styles.titleContainer}>📅 <span className={styles.title}>OctoAgenda</span> 🐙</h1>
        <p className={`${styles.subtitle} mb-2 fst-italic`}>
          ⚠️ A work in progress.. some functionality may 💩 the 🛌.{" "}
        </p>
        <p className={`${styles.subtitle}`}>🎯 Transform any webpage into calendar events with AI magic ✨</p>

        {submitSuccess && (
          <div className={styles.successMessage}>🎉 Success! Your events have been added to your calendar! 📅✨</div>
        )}

        {submitError && <div className={styles.errorAlert}>⚠️ {submitError}</div>}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.formGroup}>
            <div className={`form-floating ${styles.floatingLabel}`}>
              <input
                type="url"
                className={`form-control ${errors.url ? "is-invalid" : ""}`}
                id="urlInput"
                placeholder="https://example.com"
                {...register("url", {
                  required: "URL is required",
                  pattern: {
                    value:
                      /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,
                    message: "Please enter a valid URL",
                  },
                })}
                aria-invalid={errors.url ? "true" : "false"}
                aria-describedby="urlHelp"
                disabled={isLoading}
              />
              <label htmlFor="urlInput">🌐 Event Page URL</label>
              {errors.url && (
                <span className={styles.errorMessage} role="alert">
                  {errors.url.message}
                </span>
              )}
              {!errors.url && (
                <small id="urlHelp" className={styles.helpText}>
                  📝 Enter the URL of a page containing event information
                </small>
              )}
            </div>
          </div>

          <div className={styles.checkboxContainer}>
            <input
              type="checkbox"
              className={`form-check-input ${styles.checkbox}`}
              id="icsCheck"
              {...register("preferIcs")}
              disabled={isLoading}
            />
            <label className={`form-check-label ${styles.checkboxLabel}`} htmlFor="icsCheck">
              📥 Export as ICS file for calendar import
            </label>
          </div>

          <button type="submit" className={`btn btn-primary ${styles.submitButton}`} disabled={!isValid || isLoading}>
            {isLoading ? (
              <>
                <span className={styles.spinner}></span>🔄 Processing your events...
              </>
            ) : (
              "🚀 Extract Events & Add to Calendar 📅"
            )}
          </button>
        </form>
      </div>

      {isLoading && processingUrl && (
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <h3 className={styles.previewTitle}>📖 Page Preview</h3>
            <div className={styles.previewSubtitle}>🔍 Analyzing this page for calendar events...</div>
          </div>
          <div className={styles.iframeContainer}>
            <iframe
              src={processingUrl}
              className={styles.previewIframe}
              title="Website Preview"
              sandbox="allow-same-origin allow-scripts"
            />
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner}></div>
              <p>🤖 AI is scanning for events...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScrapeForm
