// Per-route request deadline. If the handler has not answered after `ms`, the client gets a clear
// 504 JSON response instead of waiting forever ("pending" in the browser's network tab), and any
// late reply from the handler is ignored instead of crashing with "headers already sent".
export const requestTimeout = (ms, message = 'The server took too long to answer. Please try again.') => (req, res, next) => {
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    console.warn(`[timeout] ${req.method} ${req.originalUrl} exceeded ${ms} ms`);
    res.status(504).json({ success: false, message, code: 'REQUEST_TIMEOUT' });
    // Neutralise whatever the handler tries to send later.
    res.status = () => res;
    res.json = () => res;
    res.send = () => res;
  }, ms);
  const clear = () => clearTimeout(timer);
  res.on('finish', clear);
  res.on('close', clear);
  next();
};
