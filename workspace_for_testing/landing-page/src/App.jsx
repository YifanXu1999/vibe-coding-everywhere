import './App.css'

function App() {
  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="logo">
            <span className="logo-icon">&#9670;</span>
            <span className="logo-text">Elevate</span>
          </div>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#testimonials">Testimonials</a></li>
            <li><a href="#pricing">Pricing</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <button className="btn btn-primary">Get Started</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Build Something <span className="gradient-text">Amazing</span> Today
          </h1>
          <p className="hero-subtitle">
            The all-in-one platform that empowers teams to create, collaborate,
            and deliver exceptional products faster than ever before.
          </p>
          <div className="hero-buttons">
            <button className="btn btn-primary btn-large">
              Start Free Trial
            </button>
            <button className="btn btn-secondary btn-large">
              Watch Demo
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">10K+</span>
              <span className="stat-label">Active Users</span>
            </div>
            <div className="stat">
              <span className="stat-number">99.9%</span>
              <span className="stat-label">Uptime</span>
            </div>
            <div className="stat">
              <span className="stat-number">50+</span>
              <span className="stat-label">Integrations</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-card">
            <div className="card-header">
              <div className="card-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
            </div>
            <div className="card-content">
              <div className="code-line"><span className="keyword">const</span> success = <span className="function">elevate</span>();</div>
              <div className="code-line"><span className="keyword">await</span> success.<span className="function">build</span>();</div>
              <div className="code-line comment">// Your dreams, realized</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="section-header">
          <h2>Powerful Features</h2>
          <p>Everything you need to take your project to the next level</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">&#9889;</div>
            <h3>Lightning Fast</h3>
            <p>Optimized performance that keeps your workflow smooth and efficient.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128274;</div>
            <h3>Secure by Default</h3>
            <p>Enterprise-grade security to protect your data and privacy.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#127759;</div>
            <h3>Global Scale</h3>
            <p>Deploy worldwide with our distributed infrastructure.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#129302;</div>
            <h3>AI Powered</h3>
            <p>Smart automation that learns and adapts to your needs.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128101;</div>
            <h3>Team Collaboration</h3>
            <p>Work together seamlessly with real-time collaboration tools.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128200;</div>
            <h3>Analytics</h3>
            <p>Deep insights and metrics to drive data-informed decisions.</p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="testimonials">
        <div className="section-header">
          <h2>What Our Users Say</h2>
          <p>Join thousands of satisfied customers worldwide</p>
        </div>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"Elevate transformed how our team works. We've seen a 40% increase in productivity since switching."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">SM</div>
              <div className="author-info">
                <h4>Sarah Mitchell</h4>
                <span>CTO, TechStart</span>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"The best investment we've made for our development workflow. Incredible support team too!"</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">JC</div>
              <div className="author-info">
                <h4>James Chen</h4>
                <span>Lead Developer, InnovateCo</span>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"Simple to use, powerful features, and the analytics are game-changing for our business."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">EJ</div>
              <div className="author-info">
                <h4>Emily Johnson</h4>
                <span>Product Manager, ScaleUp</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="cta-content">
          <h2>Ready to Get Started?</h2>
          <p>Join over 10,000 teams already using Elevate to build amazing products.</p>
          <div className="cta-buttons">
            <button className="btn btn-white btn-large">Start Free Trial</button>
            <button className="btn btn-outline btn-large">Contact Sales</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <span className="logo-icon">&#9670;</span>
              <span className="logo-text">Elevate</span>
            </div>
            <p>Building the future of product development.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="#integrations">Integrations</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h4>Company</h4>
              <ul>
                <li><a href="#about">About</a></li>
                <li><a href="#careers">Careers</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h4>Resources</h4>
              <ul>
                <li><a href="#docs">Documentation</a></li>
                <li><a href="#blog">Blog</a></li>
                <li><a href="#support">Support</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 Elevate. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
