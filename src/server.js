require("dotenv").config();
const app = require("./app");
const env = require("./config/env");
const { startAccountDeletionCleanup } = require("./jobs/accountDeletion.job");
const { startRegistrationCleanup } = require("./jobs/registrationCleanup.job");

app.listen(env.port, () => {
  console.log(`Server is running on port ${env.port}`);
  startAccountDeletionCleanup();
  startRegistrationCleanup();
});
