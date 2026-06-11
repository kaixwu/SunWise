import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export default function PlaceImageCarousel({ photos, interval = 3000 }) {
  const containerRef = useRef(null);
  const imagesContainerRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevIndex = useRef(0);
  const isAnimating = useRef(false);

  // Auto-slide effect
  useEffect(() => {
    if (!photos || photos.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, interval);
    return () => clearInterval(timer);
  }, [photos, interval]);

  // Initial load
  useEffect(() => {
    if (!photos || photos.length === 0) return;
    
    imagesContainerRef.current.innerHTML = "";
    
    const initialSlide = document.createElement("div");
    initialSlide.className = "img";
    const img = document.createElement("img");
    img.src = photos[0];
    img.alt = "Destination slide";
    initialSlide.appendChild(img);
    imagesContainerRef.current.appendChild(initialSlide);
    
    prevIndex.current = 0;
    setCurrentIndex(0);
  }, [photos]);

  // Slide transition effect
  useEffect(() => {
    if (!photos || photos.length <= 1 || currentIndex === prevIndex.current) return;
    if (isAnimating.current) return;
    
    isAnimating.current = true;
    
    // Smart direction calculation for looping behavior
    let direction = "left";
    if (currentIndex === 0 && prevIndex.current === photos.length - 1) {
      direction = "left";
    } else if (currentIndex === photos.length - 1 && prevIndex.current === 0) {
      direction = "right";
    } else {
      direction = currentIndex > prevIndex.current ? "left" : "right";
    }

    const slideOffset = 300;
    
    const currentSlide = imagesContainerRef.current.querySelector(".img:last-child");
    const currentSlideImg = currentSlide ? currentSlide.querySelector("img") : null;
    
    const newSlideContainer = document.createElement("div");
    newSlideContainer.className = "img";
    
    const newSlideImg = document.createElement("img");
    newSlideImg.src = photos[currentIndex];
    newSlideImg.alt = "Destination slide";
    
    gsap.set(newSlideImg, {
      x: direction === "left" ? slideOffset : -slideOffset
    });
    
    newSlideContainer.appendChild(newSlideImg);
    imagesContainerRef.current.appendChild(newSlideContainer);
    
    const ease = "expo.inOut";
    
    if (currentSlideImg) {
      gsap.to(currentSlideImg, {
        x: direction === "left" ? -slideOffset : slideOffset,
        duration: 1.5,
        ease: ease
      });
    }
    
    gsap.fromTo(newSlideContainer, {
      clipPath: direction === "left"
        ? "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)"
        : "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)"
    }, {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
      duration: 1.5,
      ease: ease,
      onComplete: () => {
        const imgElements = imagesContainerRef.current.querySelectorAll(".img");
        if (imgElements.length > 1) {
          for (let i = 0; i < imgElements.length - 1; i++) {
            imgElements[i].remove();
          }
        }
        isAnimating.current = false;
      }
    });
    
    gsap.to(newSlideImg, {
      x: 0,
      duration: 1.5,
      ease: ease
    });
    
    prevIndex.current = currentIndex;
  }, [currentIndex, photos]);

  return (
    <div 
      className="carousel modal-carousel" 
      ref={containerRef} 
      style={{ 
        position: "absolute", 
        top: 0, 
        left: 0, 
        width: "100%", 
        height: "100%", 
        zIndex: 1, 
        overflow: "hidden" 
      }}
    >
      <div 
        className="carousel-images" 
        ref={imagesContainerRef} 
        style={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          width: "100%", 
          height: "100%",
          opacity: 0.95
        }}
      ></div>
    </div>
  );
}
