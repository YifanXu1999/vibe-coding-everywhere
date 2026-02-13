import './App.css'

function App() {
  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-brand">
          <span className="brand-icon">&#9670;</span>
          <span className="brand-name">LaunchPad</span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#testimonials">Testimonials</a>
          <a href="#pricing">Pricing</a>
          <button className="btn btn-nav">Get Started</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Build Something <span className="gradient-text">Amazing</span></h1>
          <p className="hero-subtitle">
            The modern platform for developers to ship faster,
            collaborate better, and scale effortlessly.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary">Start Free Trial</button>
            <button className="btn btn-secondary">Watch Demo</button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">10k+</span>
              <span className="stat-label">Developers</span>
            </div>
            <div className="stat">
              <span className="stat-number">99.9%</span>
              <span className="stat-label">Uptime</span>
            </div>
            <div className="stat">
              <span className="stat-number">50M+</span>
              <span className="stat-label">Requests/day</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="code-window">
            <div className="window-header">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
            </div>
            <pre className="code-content">
{`const app = new LaunchPad();

app.deploy({
  name: "my-awesome-app",
  region: "global",
  scale: "auto"
});

// That's it! You're live 🚀`}
            </pre>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <h2>Everything you need to ship fast</h2>
        <p className="section-subtitle">
          Powerful features that help your team move faster
        </p>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">&#9889;</div>
            <h3>Lightning Fast</h3>
            <p>Deploy in seconds with our global edge network. Your users get the fastest experience possible.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128274;</div>
            <h3>Secure by Default</h3>
            <p>Enterprise-grade security with automatic SSL, DDoS protection, and SOC 2 compliance.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128200;</div>
            <h3>Auto Scaling</h3>
            <p>Handle any traffic spike automatically. Scale from zero to millions without configuration.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128640;</div>
            <h3>CI/CD Built-in</h3>
            <p>Push to deploy with automatic previews, rollbacks, and deployment pipelines.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128202;</div>
            <h3>Real-time Analytics</h3>
            <p>Monitor performance, errors, and user behavior with built-in observability tools.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#129309;</div>
            <h3>Team Collaboration</h3>
            <p>Work together seamlessly with shared environments, comments, and preview deployments.</p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="testimonials">
        <h2>Loved by developers worldwide</h2>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <p className="testimonial-text">
              "LaunchPad cut our deployment time from hours to seconds. Game changer for our team."
            </p>
            <div className="testimonial-author">
              <div className="author-avatar">SJ</div>
              <div>
                <div className="author-name">Sarah Johnson</div>
                <div className="author-role">CTO at TechStart</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <p className="testimonial-text">
              "The auto-scaling saved us during our product launch. We handled 100x traffic without any issues."
            </p>
            <div className="testimonial-author">
              <div className="author-avatar">MR</div>
              <div>
                <div className="author-name">Mike Rodriguez</div>
                <div className="author-role">Lead Dev at ScaleUp</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <p className="testimonial-text">
              "Best developer experience I've ever had. The preview deployments are incredibly useful."
            </p>
            <div className="testimonial-author">
              <div className="author-avatar">EW</div>
              <div>
                <div className="author-name">Emily Wang</div>
                <div className="author-role">Founder at DevTools.io</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing">
        <h2>Simple, transparent pricing</h2>
        <p className="section-subtitle">Start free, scale as you grow</p>
        <div className="pricing-grid">
          <div className="pricing-card">
            <h3>Hobby</h3>
            <div className="price">
              <span className="price-amount">$0</span>
              <span className="price-period">/month</span>
            </div>
            <ul className="pricing-features">
              <li>&#10003; 3 projects</li>
              <li>&#10003; 100GB bandwidth</li>
              <li>&#10003; SSL certificates</li>
              <li>&#10003; Community support</li>
            </ul>
            <button className="btn btn-outline">Get Started</button>
          </div>
          <div className="pricing-card featured">
            <div className="popular-badge">Most Popular</div>
            <h3>Pro</h3>
            <div className="price">
              <span className="price-amount">$20</span>
              <span className="price-period">/month</span>
            </div>
            <ul className="pricing-features">
              <li>&#10003; Unlimited projects</li>
              <li>&#10003; 1TB bandwidth</li>
              <li>&#10003; Custom domains</li>
              <li>&#10003; Priority support</li>
              <li>&#10003; Team collaboration</li>
            </ul>
            <button className="btn btn-primary">Start Free Trial</button>
          </div>
          <div className="pricing-card">
            <h3>Enterprise</h3>
            <div className="price">
              <span className="price-amount">Custom</span>
            </div>
            <ul className="pricing-features">
              <li>&#10003; Everything in Pro</li>
              <li>&#10003; Unlimited bandwidth</li>
              <li>&#10003; SLA guarantee</li>
              <li>&#10003; Dedicated support</li>
              <li>&#10003; Custom integrations</li>
            </ul>
            <button className="btn btn-outline">Contact Sales</button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <h2>Ready to launch?</h2>
        <p>Join thousands of developers shipping faster with LaunchPad</p>
        <button className="btn btn-primary btn-large">Start Building Today</button>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="brand-icon">&#9670;</span>
            <span className="brand-name">LaunchPad</span>
            <p>The modern platform for developers.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Product</h4>
              <a href="#">Features</a>
              <a href="#">Pricing</a>
              <a href="#">Changelog</a>
              <a href="#">Docs</a>
            </div>
            <div className="footer-column">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-column">
              <h4>Legal</h4>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Security</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 LaunchPad. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
