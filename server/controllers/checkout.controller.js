'use strict';

const checkoutService = require('../services/checkout.service');
const { validate } = require('../validators/validate');
const { deliveryBody } = require('../validators/checkout.validators');

function createCheckoutController({ pool }) {
  return {
    /** GET /api/checkout - cart review, stock check, delivery details and totals */
    async summary(req, res) {
      res.json({ data: await checkoutService.getCheckoutSummary(pool, req.user.id) });
    },

    /** PUT /api/checkout/delivery - save the delivery details for this cart */
    async saveDelivery(req, res) {
      const input = validate(deliveryBody, req.body, 'Some of the delivery details are missing or not valid.');
      res.json({ data: await checkoutService.saveDeliveryDetails(pool, req.user.id, input) });
    },
  };
}

module.exports = { createCheckoutController };
