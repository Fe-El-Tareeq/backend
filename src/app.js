const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const routes = require("./routes");
const testRoutes = require("./routes/test.routes");
const { apiRateLimiter } = require("./middleware/rateLimit.middleware");
const {
  notFoundHandler,
  errorHandler,
} = require("./middleware/error.middleware");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(apiRateLimiter);

app.get("/health", (req, res) => {
  res.json({ success: true, message: "API is running" });
});

app.use("/api/test", testRoutes);
app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
