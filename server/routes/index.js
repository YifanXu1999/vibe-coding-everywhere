/**
 * Express routes for the server.
 * 
 * Defines all HTTP endpoints for:
 * - Server configuration
 * - Workspace file tree browsing
 * - File content retrieval
 * - Raw file serving for previews
 */
import fs from "fs";
import path from "path";
import { SIDEBAR_REFRESH_INTERVAL_MS, WORKSPACE_CWD } from "../config/index.js";
import { buildWorkspaceTree, IMAGE_EXT, MAX_TEXT_FILE_BYTES } from "../utils/index.js";

/**
 * Configure all Express routes on the given app instance.
 * @param {import('express').Application} app - Express application
 */
export function setupRoutes(app) {
  // API request logging middleware - logs all API calls with timestamp and status
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      const ts = new Date().toISOString();
      console.log(`[API] ${ts} ${req.method} ${req.path}`, req.query && Object.keys(req.query).length ? req.query : "");
      res.on("finish", () => {
        console.log(`[API] ${ts} ${req.method} ${req.path} -> ${res.statusCode}`);
      });
    }
    next();
  });

  /**
   * GET /api/config
   * Returns server configuration for client initialization.
   * Used by mobile app to know refresh intervals.
   */
  app.get("/api/config", (_, res) => {
    res.json({
      sidebarRefreshIntervalMs: SIDEBAR_REFRESH_INTERVAL_MS,
    });
  });

  /**
   * GET /api/workspace-path
   * Returns the absolute path to the current workspace directory.
   * Used by clients to display current project location.
   */
  app.get("/api/workspace-path", (_, res) => {
    res.json({ path: WORKSPACE_CWD });
  });

  /**
   * GET /api/workspace-tree
   * Returns the recursive file tree of the workspace.
   * Used by sidebar to show folder structure.
   * Each node has: name, path, type (file|folder), children (for folders)
   */
  app.get("/api/workspace-tree", (_, res) => {
    try {
      const tree = buildWorkspaceTree(WORKSPACE_CWD);
      res.json({ root: path.basename(WORKSPACE_CWD), tree });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to read workspace" });
    }
  });

  /**
   * GET /api/preview-raw
   * Serve raw workspace files for preview (HTML, CSS, JS, etc.)
   * Returns files with appropriate Content-Type headers.
   * Security: Path is normalized and checked to stay within workspace.
   * 
   * Query params:
   *   - path: Relative path to file within workspace
   */
  app.get("/api/preview-raw", (req, res) => {
    const relPath = req.query.path;
    if (typeof relPath !== "string" || !relPath.trim()) {
      return res.status(400).send("Missing or invalid path");
    }
    try {
      // Normalize path and prevent directory traversal attacks
      const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
      const fullPath = path.join(WORKSPACE_CWD, normalized);
      
      // Security check: ensure path stays within workspace
      if (!fullPath.startsWith(WORKSPACE_CWD)) {
        return res.status(403).send("Path outside workspace");
      }
      
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return res.status(400).send("Not a file");
      
      // Determine MIME type based on file extension
      const ext = path.extname(normalized).toLowerCase().replace(/^\./, "");
      const mime = ext === "html" || ext === "htm" ? "text/html" : 
                   ext === "css" ? "text/css" : 
                   ext === "js" ? "application/javascript" : 
                   "application/octet-stream";
      
      res.setHeader("Content-Type", mime);
      res.sendFile(fullPath);
    } catch (err) {
      if (err.code === "ENOENT") return res.status(404).send("File not found");
      res.status(500).send(err.message || "Failed to serve file");
    }
  });

  /**
   * Serve workspace files at root path.
   * Allows URLs like http://host:PORT/abc.html to work for preview.
   * Falls through to next handler if file doesn't exist.
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  function serveWorkspaceFile(req, res, next) {
    // Default to index.html for root path
    const rawPath = (req.path || "/").replace(/^\//, "") || "index.html";
    
    // Normalize and prevent directory traversal
    const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
    const fullPath = path.join(WORKSPACE_CWD, normalized);
    
    // Security check
    if (!fullPath.startsWith(WORKSPACE_CWD)) return next();
    
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return next();
      
      // Set appropriate Content-Type
      const ext = path.extname(normalized).toLowerCase().replace(/^\./, "");
      const mime = ext === "html" || ext === "htm" ? "text/html" : 
                   ext === "css" ? "text/css" : 
                   ext === "js" ? "application/javascript" : 
                   "application/octet-stream";
      
      res.setHeader("Content-Type", mime);
      res.sendFile(fullPath);
    } catch (err) {
      if (err.code === "ENOENT") return next();
      res.status(500).send(err.message || "Failed to serve file");
    }
  }

  /**
   * GET /api/workspace-file
   * Returns file content as JSON.
   * Images are returned as base64-encoded strings.
   * Text files have size limits to prevent UI freezing.
   * 
   * Query params:
   *   - path: Relative path to file within workspace
   */
  app.get("/api/workspace-file", (req, res) => {
    const relPath = req.query.path;
    if (typeof relPath !== "string" || !relPath.trim()) {
      return res.status(400).json({ error: "Missing or invalid path" });
    }
    try {
      // Normalize path
      const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
      const fullPath = path.join(WORKSPACE_CWD, normalized);
      
      // Security check
      if (!fullPath.startsWith(WORKSPACE_CWD)) {
        return res.status(403).json({ error: "Path outside workspace" });
      }
      
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        return res.status(400).json({ error: "Not a file" });
      }
      
      // Check if it's an image file
      const ext = path.extname(normalized).toLowerCase().replace(/^\./, "");
      const isImage = IMAGE_EXT.has(ext);
      
      if (isImage) {
        // Return images as base64
        const buffer = fs.readFileSync(fullPath);
        const content = buffer.toString("base64");
        res.json({ path: normalized, content, isImage: true });
      } else {
        // Check file size limit for text files
        if (stat.size > MAX_TEXT_FILE_BYTES) {
          return res.status(413).json({
            error: `File too large to display (${Math.round(stat.size / 1024)} KB, max ${Math.round(MAX_TEXT_FILE_BYTES / 1024)} KB). Try a smaller file.`,
          });
        }
        // Return text content
        const content = fs.readFileSync(fullPath, "utf8");
        res.json({ path: normalized, content });
      }
    } catch (err) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "File not found" });
      res.status(500).json({ error: err.message || "Failed to read file" });
    }
  });

  // Catch-all for non-API paths so /abc.html and /subdir/index.html work
  // Must be registered after all /api/* routes
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    serveWorkspaceFile(req, res, next);
  });
}
