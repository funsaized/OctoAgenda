'use client';

import React from 'react';
import Image from "next/image";
import styles from "../app/page.module.css";

import { useForm } from 'react-hook-form';

function ScrapeForm() {
  const {
      register,
      handleSubmit,
      formState: { errors, isValid },
    } = useForm();

  return (

    <div className="card" style={{width: 30 + 'rem'}}>
      <Image
        className={`${styles.logo} card-img-top`}
        src="/next.svg"
        alt="Next.js logo"
        width={180}
        height={38}
        priority
      />
    <div className="card-body">
      <h5 className="card-title"></h5>
      <form onSubmit={handleSubmit((data) => console.log(data))}>
        <div className="form-group mb-2">
          <label htmlFor="url">URL</label>
          {/*<input type="email" className="form-control" id="url" aria-describedby="urlHelp" placeholder="Enter URL to scrape"/>*/}
          <input {...register('url', { required: true})} className="form-control" aria-describedby="urlHelp" placeholder="Enter URL to scrape" aria-invalid={errors.name ? "true" : "false"}/>

          <small id="urlHelp" className="form-text text-muted">AI will do the heavy lifting 🚀🚀🚀</small>
        </div>
        <div className="form-group form-check mb-2">
          <input type="checkbox" className="form-check-input" {...register('checkbox', { required: false})}/>
            <label className="form-check-label" htmlFor="exampleCheck1">Check me out</label>
        </div>
        <button disabled={!isValid} type="submit" className="btn btn-primary">Submit</button>
      </form>
    </div>
  </div>
  );
}

export default ScrapeForm;
