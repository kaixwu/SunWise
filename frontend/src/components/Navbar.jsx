import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { LogOut, User, Settings } from "lucide-react";
import gsap from "gsap";
import SplitType from "split-type";

export default function Navbar() {
  const { username, role, logout, setShowPreferences } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const isAnimating = useRef(false);
  const tl = useRef(null);
  const splitLinks = useRef(null);



  // Track scroll position for glassmorphic effect
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    // Read current position immediately on mount / page change
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location.pathname]);
  
  const navItems = [
    { name: "Home", path: "/home" },
    { name: "Weather", path: "/weather" },
    { name: "Destinations", path: "/destinations" },
    { name: "Planner", path: "/planner" },
  ];

  if (role === "admin") {
    navItems.push({ name: "Admin Dashboard", path: "/admin" });
  }

  // Split-Type initialization and handling dynamic React changes
  useEffect(() => {
    const timer = setTimeout(() => {
        if (splitLinks.current) {
            splitLinks.current.revert();
        }
        splitLinks.current = new SplitType(".nav-items-container a", {
            types: "lines",
            lineClass: "line"
        });
    }, 50);

    return () => clearTimeout(timer);
  }, [location.pathname, role]);
  
  // GSAP Timeline setup
  useEffect(() => {
    tl.current = gsap.timeline({
        paused: true,
        onComplete: () => {
            isAnimating.current = false;
        },
        onReverseComplete: () => {
            gsap.set(".nav-items-container a .line", { y: "100%" });
            isAnimating.current = false;
        }
    });

    const navBgs = document.querySelectorAll(".nav-bg");
    
    tl.current.to(navBgs, {
        scaleY: 1,
        duration: 0.75,
        stagger: 0.1,
        ease: "power3.inOut"
    });

    tl.current.to(".nav-items-container", {
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        duration: 0.75,
        ease: "power3.inOut"
    }, "-=0.6");
    
    return () => {
        if (tl.current) tl.current.kill();
        if (splitLinks.current) splitLinks.current.revert();
    };
  }, []);

  const toggleMenu = () => {
      if (isAnimating.current) return;
      isAnimating.current = true;
      
      if (isMenuOpen) {
          tl.current.reverse();
      } else {
          tl.current.play();
          
          const linkBlocks = [
              ".nav-primary-links .line",
              ".nav-secondary-links .line"
          ];
          
          linkBlocks.forEach((selector) => {
              gsap.fromTo(
                  selector,
                  { y: "100%" },
                  {
                      y: "0%",
                      duration: 0.75,
                      stagger: 0.05,
                      ease: "power3.out",
                      delay: 0.85
                  }
              );
          });
      }
      setIsMenuOpen(!isMenuOpen);
  };
  
  const handleLinkClick = (e, path) => {
      e.preventDefault();
      if (location.pathname === path) {
          toggleMenu(); 
      } else {
          toggleMenu();
          setTimeout(() => {
              navigate(path);
          }, 800); 
      }
  };

  const handleLogout = (e) => {
      e.preventDefault();
      toggleMenu();
      setTimeout(() => {
          logout();
      }, 800);
  };

  const handleEditPreferences = (e) => {
      e.preventDefault();
      toggleMenu();
      setTimeout(() => {
          setShowPreferences(true);
      }, 800);
  };

  return (
    <>
      <nav 
        className={`nav-wrapper${isScrolled ? " scrolled" : ""}`}
      >
        <div className="nav-logo">
          <Link to="/home" style={{ textDecoration: "none" }} onClick={(e) => {
              if (isMenuOpen) {
                  e.preventDefault();
                  toggleMenu();
                  setTimeout(() => navigate("/home"), 800);
              }
          }}>
            <h1 className="font-heading" style={{ color: isMenuOpen ? "#fff" : "var(--accent-blue)", fontSize: "1.8rem", margin: 0, transition: "color 0.4s ease" }}>SunWise</h1>
          </Link>
        </div>
        <button className={`nav-toggler ${isMenuOpen ? "open" : ""}`} onClick={toggleMenu}>
          <span style={{ backgroundColor: isMenuOpen ? "#fff" : "var(--accent-blue)" }}></span>
          <span style={{ backgroundColor: isMenuOpen ? "#fff" : "var(--accent-blue)" }}></span>
        </button>
      </nav>

      <div className="nav-content">
          <div className="nav-bg"></div>
          <div className="nav-bg"></div>
          <div className="nav-bg"></div>
          <div className="nav-bg"></div>
          
          <div className="nav-items-container">
              <div className="nav-items-col">
                  <div className="nav-primary-links">
                      {navItems.map(item => (
                          <a 
                              key={item.name} 
                              href={item.path} 
                              onClick={(e) => handleLinkClick(e, item.path)}
                              style={{ color: location.pathname === item.path ? "var(--accent-teal)" : "#fff" }}
                          >
                              {item.name}
                          </a>
                      ))}
                  </div>
              </div>
              
              <div className="nav-items-col">
                  <div className="nav-secondary-links">
                      <a href="#" onClick={e=>e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: "8px", pointerEvents: "none" }}>
                          <User size={20} /> {username}
                      </a>
                      <a href="#" onClick={handleEditPreferences} style={{ color: "var(--accent-teal)", display: "flex", alignItems: "center", gap: "8px" }}>
                          <Settings size={20} /> Edit Preferences
                      </a>
                      <a href="#" onClick={handleLogout} style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: "8px" }}>
                          <LogOut size={20} /> Log Out
                      </a>
                  </div>
              </div>
          </div>
      </div>
    </>
  );
}
