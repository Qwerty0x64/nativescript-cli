import isPlainObject from 'lodash/isPlainObject';
import { get as getConfig } from '../kinvey/config';
import ActiveUserError from '../errors/activeUser';
import KinveyError from '../errors/kinvey';
import NotFoundError from '../errors/notFound';
import { formatKinveyUrl } from '../http/utils';
import { KinveyRequest, RequestMethod } from '../http/request';
import { Auth } from '../http/auth';
import { set as setSession } from '../session';
import { getActiveUser, User } from './user';
import { mergeSocialIdentity } from './utils';
import * as MIC from './mic';
import { signup } from './signup';

const USER_NAMESPACE = 'user';

export async function login(username, password, options = {}) {
  const { apiProtocol, apiHost, appKey } = getConfig();
  const activeUser = getActiveUser();
  let credentials = username;

  if (activeUser) {
    throw new ActiveUserError('An active user already exists. Please logout the active user before you login.');
  }

  if (!isPlainObject(credentials)) {
    credentials = { username, password };
  }

  if (credentials.username) {
    credentials.username = String(credentials.username).trim();
  }

  if (credentials.password) {
    credentials.password = String(credentials.password).trim();
  }

  if ((!credentials.username || credentials.username === '' || !credentials.password || credentials.password === '')
    && !credentials._socialIdentity) {
    throw new KinveyError('Username and/or password missing. Please provide both a username and password to login.');
  }

  const request = new KinveyRequest({
    method: RequestMethod.POST,
    auth: Auth.App,
    url: formatKinveyUrl(apiProtocol, apiHost, `/${USER_NAMESPACE}/${appKey}/login`),
    body: credentials,
    timeout: options.timeout
  });
  const response = await request.execute();
  const session = response.data;

  // Remove sensitive data
  delete session.password;

  // Merge _socialIdentity
  if (credentials._socialIdentity) {
    session._socialIdentity = mergeSocialIdentity(credentials._socialIdentity, session._socialIdentity);
  }

  // Store the active session
  setSession(session);

  // Return the user
  return new User(session);
}

export async function loginWithRedirectUri(redirectUri, options) {
  const activeUser = getActiveUser();

  if (activeUser) {
    throw new ActiveUserError(
      'An active user already exists. Please logout the active user before you login with Mobile Identity Connect.'
    );
  }

  const session = await MIC.loginWithRedirectUri(redirectUri, options);
  const socialIdentity = {};
  socialIdentity[MIC.IDENTITY] = session;
  const credentials = { _socialIdentity: socialIdentity };

  try {
    return await login(credentials);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return await signup(credentials);
    }

    throw error;
  }
}

export async function loginWithMIC(redirectUri, authorizationGrant, options) {
  return loginWithRedirectUri(redirectUri, options);
}

export async function loginWithUsernamePassword(username, password, options) {
  const activeUser = getActiveUser();

  if (activeUser) {
    throw new ActiveUserError(
      'An active user already exists. Please logout the active user before you login with Mobile Identity Connect.'
    );
  }

  const session = await MIC.loginWithUsernamePassword(username, password, options);
  const socialIdentity = {};
  socialIdentity[MIC.IDENTITY] = session;
  const credentials = { _socialIdentity: socialIdentity };

  try {
    return await login(credentials);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return await signup(credentials);
    }

    throw error;
  }
}
