import { useCallback, useEffect, useRef, useState } from 'react';

export default function useSeamlessVideo() {
    const videoRefs = useRef([null, null]);
    const transitioning = useRef(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const switchVideo = useCallback((index) => {
        const video = videoRefs.current[index];
        const next = videoRefs.current[(index + 1) % videoRefs.current.length];
        if (!video || !next || transitioning.current || !video.duration) return;

        transitioning.current = true;
        next.currentTime = 0;
        next.play().catch(() => {});
        setActiveIndex((index + 1) % videoRefs.current.length);
        window.setTimeout(() => {
            video.pause();
            video.currentTime = 0;
            transitioning.current = false;
        }, 600);
    }, []);

    const handleTimeUpdate = useCallback((index) => {
        const video = videoRefs.current[index];
        if (video?.duration && video.currentTime >= video.duration - 0.55) switchVideo(index);
    }, [switchVideo]);

    const handleEnded = useCallback((index) => switchVideo(index), [switchVideo]);

    useEffect(() => () => {
        videoRefs.current.forEach(video => video?.pause());
    }, []);

    return { videoRefs, activeIndex, handleTimeUpdate, handleEnded };
}
