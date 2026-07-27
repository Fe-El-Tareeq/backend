function createRepository(featureName) {
  const records = [];

  return {
    async findAll() {
      return records;
    },

    async create(data) {
      const record = {
        id: records.length + 1,
        feature: featureName,
        ...data,
        createdAt: new Date().toISOString(),
      };

      records.push(record);
      return record;
    },
  };
}

function createService(featureName, repository) {
  return {
    async list() {
      return repository.findAll();
    },

    async create(data) {
      return repository.create(data);
    },
  };
}

function createController(featureName, service) {
  return {
    async list(req, res, next) {
      try {
        const data = await service.list();
        res.json({ success: true, feature: featureName, data });
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        const data = await service.create(req.body || {});
        res.status(201).json({ success: true, feature: featureName, data });
      } catch (error) {
        next(error);
      }
    },
  };
}

function createValidation() {
  return {
    validateCreate(req, res, next) {
      next();
    },
  };
}

function createRoute(controller, validation) {
  const express = require('express');
  const router = express.Router();

  router.get('/', controller.list);
  router.post('/', validation.validateCreate, controller.create);

  return router;
}

module.exports = {
  createRepository,
  createService,
  createController,
  createValidation,
  createRoute,
};
