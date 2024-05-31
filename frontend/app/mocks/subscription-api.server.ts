import { HttpResponse, http } from 'msw';
import { z } from 'zod';

import { db } from './db';
import { getLogger } from '~/utils/logging.server';

const log = getLogger('subscription-api.server');

const subscriptionApiSchema = z.object({
  id: z.string(),
  userId: z.string(),
  msLanguageCode: z.string(),
  alertTypeCode: z.string(),
});

const validateSubscriptionSchema = z.object({
  email: z.string(),
  confirmationCode: z.string(),
});

const requestCodeSubscriptionSchema = z.object({
  email: z.string(),
});

/**
 * Server-side MSW mocks for the subscription API.
 */
export function getSubscriptionApiMockHandlers() {
  log.info('Initializing Subscription API mock handlers');

  return [
    //
    // Handler for GET request to retrieve user by userId
    //
    http.get('https://api.cdcp.example.com/api/v1/users/:userId', ({ params, request }) => {
      log.debug('Handling request for [%s]', request.url);

      const parsedUserId = z.string().safeParse(params.userId);

      if (!parsedUserId.success) {
        throw new HttpResponse(null, { status: 400 });
      }

      const userEntity = db.user.findFirst({
        where: { id: { equals: parsedUserId.data } },
      });

      return HttpResponse.json({
        ...userEntity,
        _links: {
          self: {
            href: `https://api.cdcp.example.com/api/v1/users/${parsedUserId.data}`,
          },
          subscriptions: {
            href: `https://api.cdcp.example.com/api/v1/users/${parsedUserId.data}/subscriptions`,
          },
        },
      });
    }),

    //
    // Handler for GET request to retrieve subscriptions by userId
    //
    http.get('https://api.cdcp.example.com/api/v1/users/:userId/subscriptions', ({ params, request }) => {
      log.debug('Handling request for [%s]', request.url);

      const parsedUserId = z.string().safeParse(params.userId);

      if (!parsedUserId.success) {
        throw new HttpResponse(null, { status: 400 });
      }

      const subscriptionEntities = db.subscription.findMany({
        where: { userId: { equals: parsedUserId.data } },
      });

      return HttpResponse.json({
        _embedded: {
          subscriptions: subscriptionEntities,
        },
        _links: {
          self: {
            href: `https://api.cdcp.example.com/api/v1/users/${parsedUserId.data}/subscriptions`,
          },
        },
      });
    }),

    //
    // Handler for PUT request to update email alerts decription
    //
    http.put('https://api.cdcp.example.com/v1/users/:userId/subscriptions', async ({ params, request }) => {
      log.debug('Handling request for [%s]', request.url);

      const requestBody = await request.json();
      const parsedSubscriptionApi = await subscriptionApiSchema.safeParseAsync(requestBody);

      if (!parsedSubscriptionApi.success) {
        throw new HttpResponse(null, { status: 400 });
      }

      if (parsedSubscriptionApi.data.id === '') {
        db.subscription.create({
          userId: parsedSubscriptionApi.data.userId,
          msLanguageCode: parsedSubscriptionApi.data.msLanguageCode,
          alertTypeCode: 'CDCP',
        });
      } else {
        db.subscription.update({
          where: { id: { equals: parsedSubscriptionApi.data.id } },
          data: {
            msLanguageCode: parsedSubscriptionApi.data.msLanguageCode,
          },
        });
      }

      return HttpResponse.text(null, { status: 204 });
    }),

    http.post('https://api.cdcp.example.com/v1/codes/verify', async ({ params, request }) => {
      log.debug('Handling request for [%s]', request.url);
      const timeEntered = new Date();
      const requestBody = await request.json();
      const validateSubscriptionSchemaData = validateSubscriptionSchema.safeParse(requestBody);
      if (!validateSubscriptionSchemaData.success) {
        throw new HttpResponse(null, { status: 400 });
      }
      const subscriptionConfirmationCodesEntities = db.subscriptionConfirmationCode.findMany({
        where: { email: { equals: validateSubscriptionSchemaData.data.email } },
      });

      if (subscriptionConfirmationCodesEntities.length === 0) {
        return HttpResponse.json({ confirmCodeStatus: 'noCode' }, { status: 200 });
      }

      const latestConfirmCode = subscriptionConfirmationCodesEntities.reduce((prev, current) => (prev.createdDate > current.createdDate ? prev : current));

      if (latestConfirmCode.confirmationCode === validateSubscriptionSchemaData.data.confirmationCode && timeEntered < latestConfirmCode.expiryDate) {
        return HttpResponse.json({ confirmCodeStatus: 'Valid' }, { status: 200 });
      }
      if (latestConfirmCode.confirmationCode === validateSubscriptionSchemaData.data.confirmationCode && timeEntered > latestConfirmCode.expiryDate) {
        //Code expired
        return HttpResponse.json({ confirmCodeStatus: 'expired' }, { status: 200 });
      }

      //There is at least 1 confirmation code for this user but the code entered by said user does not match it..
      return HttpResponse.json({ confirmCodeStatus: 'mismatch' }, { status: 200 });
    }),

    http.post('https://api.cdcp.example.com/v1/codes/request', async ({ params, request }) => {
      log.debug('Handling request for [%s]', request.url);
      const timeEntered = new Date();
      const requestBody = await request.json();
      const requestCodeSubscriptionSchemaData = requestCodeSubscriptionSchema.safeParse(requestBody);
      if (!requestCodeSubscriptionSchemaData.success) {
        throw new HttpResponse(null, { status: 400 });
      }

      const subscriptionConfirmationCodesEntities = db.subscriptionConfirmationCode.findMany({
        where: { email: { equals: requestCodeSubscriptionSchemaData.data.email } },
      });

      if (subscriptionConfirmationCodesEntities.length === 0) {
        //No code found for that user --- generate a new code and update the user entity
        db.subscriptionConfirmationCode.create({
          id: '0000101',
          email: requestCodeSubscriptionSchemaData.data.email,
          confirmationCode: '0101',
          createdDate: timeEntered,
          expiryDate: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000), // current date date + 2 days
        });
      } else {
        // Email existed with code already, updating the code only.
        db.subscriptionConfirmationCode.update({
          where: { email: { equals: requestCodeSubscriptionSchemaData.data.email } },
          data: {
            confirmationCode: '0101',
            createdDate: timeEntered,
            expiryDate: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000), // current date date + 2 days
          },
        });
      }

      return HttpResponse.json({ confirmCodeStatus: 'No Content' }, { status: 204 });
    }),
  ];
}
