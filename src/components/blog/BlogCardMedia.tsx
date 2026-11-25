import React, { useState } from "react";
import { NEW_DEFAULT_COVER_URL, resolvePostCoverImage, resolvePostCoverVideo } from "./blogHelpers";

export default function BlogCardMedia({
  post,
  className = "w-full h-full object-cover group-hover:scale-105 transition duration-500",
}: {
  post: {
    title: string;
    cover_url?: string | null;
    cover_image_url?: string | null;
    cover_video_url?: string | null;
  };
  className?: string;
}) {
  const videoUrl = resolvePostCoverVideo(post);
  const imageUrl = resolvePostCoverImage(post);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState(imageUrl);

  if (videoUrl && !videoFailed) {
    return (
      <video
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setVideoFailed(true)}
        className={className}
      />
    );
  }

  return (
    <img
      src={imgSrc}
      alt={post.title}
      itemProp="image"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (imgSrc !== NEW_DEFAULT_COVER_URL) {
          setImgSrc(NEW_DEFAULT_COVER_URL);
        }
      }}
      className={className}
    />
  );
}
