/**
 * SessionService is a service module responsible for managing user sessions.
 * Sessions can be stored in memory, as files on disk, or in a Redis database.
 *
 * All createSessionStorage() functions take a cookie object, which is used to
 * create browser's the session cookie. The session cookie is then used to track
 * the user's session.
 *
 * The SessionService module provides functions for creating, reading,
 * updating, and deleting session data.
 *
 * Example usage:
 *
 *    const sessionStorage = await getSessionService().createSessionStorage();
 *    const session = await sessionStorage.getSession(request.headers.get('Cookie'));
 *    return json({}, {
 *      headers: {
 *        'Set-Cookie': await sessionStorage.commitSession(session)
 *      }
 *    });
 *
 * @see https://remix.run/docs/en/main/utils/sessions
 */
import { createCookie, createFileSessionStorage, createSessionStorage } from '@remix-run/node';

import { randomUUID } from 'node:crypto';

import { redisService } from '~/services/redis-service.server';
import { getEnv } from '~/utils/env.server';
import { getLogger } from '~/utils/logging.server';

function createSessionService() {
  const log = getLogger('session-service.server');

  const env = getEnv();

  const sessionCookie = createCookie(env.SESSION_COOKIE_NAME, {
    path: env.SESSION_COOKIE_PATH,
    domain: env.SESSION_COOKIE_DOMAIN,
    maxAge: env.SESSION_COOKIE_MAX_AGE,
    secrets: [env.SESSION_COOKIE_SECRET],
    secure: env.SESSION_COOKIE_SECURE,
    httpOnly: env.SESSION_COOKIE_HTTP_ONLY,
  });

  switch (env.SESSION_STORAGE_TYPE) {
    case 'file':
      log.warn('Using file-backed sessions. This is not recommended for production.');
      return createFileSessionStorage({ cookie: sessionCookie, dir: env.SESSION_FILE_DIR });
    case 'redis':
      log.info('Using Redis-backed sessions.');
      return createRedisSessionStorage();
    default:
      // this should never happen (because: typescript)
      throw new Error(`Unknown session storage type: ${env.SESSION_STORAGE_TYPE}`);
  }

  function createRedisSessionStorage() {
    const sessionId = randomUUID();
    const setCommandOptions = { EX: env.SESSION_EXPIRES_SECONDS };

    return createSessionStorage({
      cookie: sessionCookie,
      createData: async (data) => {
        log.debug(`Creating new session storage slot with id=[${sessionId}]`);
        await redisService.set(sessionId, JSON.stringify(data), setCommandOptions);
        return sessionId;
      },
      readData: async (id) => {
        log.debug(`Reading session data for session id=[${id}]`);
        return JSON.parse(await redisService.get(id));
      },
      updateData: async (id, data) => {
        log.debug(`Updating session data for session id=[${id}]`);
        await redisService.set(id, JSON.stringify(data), setCommandOptions);
      },
      deleteData: async (id) => {
        log.debug(`Deleting all session data for session id=[${id}]`);
        await redisService.del(id);
      },
    });
  }
}

// singleton instance of session service
export const sessionService = createSessionService();
