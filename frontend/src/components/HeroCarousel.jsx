import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import SplitType from "split-type";

export default function HeroCarousel({ items, currentIndex }) {
  const carouselRef = useRef(null);
  const imagesContainerRef = useRef(null);
  const titlesContainerRef = useRef(null);
  
  const isAnimating = useRef(false);
  const prevIndex = useRef(currentIndex);
  
  useEffect(() => {
    if (!items || items.length === 0) return;
    
    // Initial clear
    imagesContainerRef.current.innerHTML = "";
    titlesContainerRef.current.innerHTML = "";
    
    // Create titles
    items.forEach((item, index) => {
      const titleContainer = document.createElement("div");
      titleContainer.className = "slide-title-container";
      if (index !== 0) {
        titleContainer.style.opacity = "0";
      }
      
      const title = document.createElement("h1");
      title.className = "hero-place-title";
      title.textContent = item.title || "Beautiful Destination";
      
      titleContainer.appendChild(title);
      titlesContainerRef.current.appendChild(titleContainer);
    });
    
    // Split text
    const titleElements = titlesContainerRef.current.querySelectorAll(".hero-place-title");
    titleElements.forEach((el) => {
        new SplitType(el, { types: "words", wordsClass: "word" });
    });
    
    // Initial Image
    const initialSlide = document.createElement("div");
    initialSlide.className = "img";
    const img = document.createElement("img");
    img.src = items[0].url || items[0];
    initialSlide.appendChild(img);
    imagesContainerRef.current.appendChild(initialSlide);
    
    // Animate first text
    if (titlesContainerRef.current.children.length > 0) {
        const firstWords = titlesContainerRef.current.children[0].querySelectorAll(".word");
        gsap.set(firstWords, { filter: "blur(75px)", opacity: 0 });
        gsap.to(firstWords, {
            filter: "blur(0px)",
            opacity: 1,
            duration: 2,
            ease: "power3.out"
        });
    }
    
    prevIndex.current = 0;
  }, [items]);
  
  useEffect(() => {
    if (!items || items.length <= 1 || currentIndex === prevIndex.current) return;
    if (isAnimating.current) return;
    
    isAnimating.current = true;
    
    const direction = currentIndex > prevIndex.current ? "left" : "right"; 
    // Wait, typical carousel: next index (currentIndex > prevIndex) slides from right to left (direction="left").
    
    const viewportWidth = window.innerWidth;
    const slideOffset = Math.min(viewportWidth * 0.5, 500);
    
    const currentSlide = imagesContainerRef.current.querySelector(".img:last-child");
    const currentSlideImg = currentSlide ? currentSlide.querySelector("img") : null;
    
    const newSlideContainer = document.createElement("div");
    newSlideContainer.className = "img";
    const newSlideImg = document.createElement("img");
    newSlideImg.src = items[currentIndex].url || items[currentIndex];
    
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
            if (imagesContainerRef.current) {
                const imgElements = imagesContainerRef.current.querySelectorAll(".img");
                if (imgElements.length > 1) {
                    for (let i = 0; i < imgElements.length - 1; i++) {
                        imgElements[i].remove();
                    }
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
    
    // Text animation
    const titleContainers = titlesContainerRef.current.children;
    if (titleContainers.length > currentIndex) {
        const currentWords = titleContainers[currentIndex].querySelectorAll(".word");
        
        Array.from(titleContainers).forEach((container, i) => {
            if (i !== currentIndex) {
                const words = container.querySelectorAll(".word");
                gsap.to(words, {
                    filter: "blur(75px)",
                    opacity: 0,
                    duration: 1.5,
                    ease: "power3.out",
                    overwrite: true,
                    onComplete: () => {
                        if (container) {
                            container.style.opacity = "0";
                        }
                    }
                });
            }
        });
        
        titleContainers[currentIndex].style.opacity = "1";
        gsap.set(currentWords, { filter: "blur(75px)", opacity: 0 });
        gsap.to(currentWords, {
            filter: "blur(0px)",
            opacity: 1,
            duration: 2,
            ease: "power3.out",
            overwrite: true
        });
    }
    
    prevIndex.current = currentIndex;
  }, [currentIndex, items]);

  return (
    <div className="carousel" ref={carouselRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1, overflow: "hidden" }}>
      <svg style={{ position: "absolute", zIndex: -1, opacity: 0 }}>
        <defs>
          <filter id="blur-matrix">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140" />
          </filter>
        </defs>
      </svg>
      <div className="carousel-images" ref={imagesContainerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.9 }}></div>
      <div className="carousel-titles" ref={titlesContainerRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}></div>
    </div>
  );
}
