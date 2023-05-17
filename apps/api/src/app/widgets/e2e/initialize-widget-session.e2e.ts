import { UserSession } from '@novu/testing';
import { expect } from 'chai';
import { IntegrationRepository } from '@novu/dal';
import { createHash } from '../../shared/helpers/hmac.service';
import { ChannelTypeEnum, InAppProviderIdEnum } from '@novu/shared';
import { encryptCredentials } from '@novu/application-generic';

describe('Initialize Session - /widgets/session/initialize (POST)', async () => {
  let session: UserSession;
  const integrationRepository = new IntegrationRepository();

  before(async () => {
    session = new UserSession();
    await session.initialize();
  });

  it('should create a valid app session for current widget user', async function () {
    const { body } = await session.testAgent
      .post('/v1/widgets/session/initialize')
      .send({
        applicationIdentifier: session.environment.identifier,
        subscriberId: '12345',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '054777777',
      })
      .expect(201);

    expect(body.data.token).to.be.ok;
    expect(body.data.profile._id).to.be.ok;
    expect(body.data.profile.firstName).to.equal('Test');
    expect(body.data.profile.phone).to.equal('054777777');
    expect(body.data.profile.lastName).to.equal('User');
  });

  it('should throw an error when an invalid environment Id passed', async function () {
    const { body } = await session.testAgent.post('/v1/widgets/session/initialize').send({
      applicationIdentifier: 'some-not-existing-id',
      subscriberId: '12345',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '054777777',
    });

    expect(body.message).to.contain('Please provide a valid app identifier');
  });

  it('should pass the test with valid HMAC hash', async function () {
    const subscriberId = '12345';
    const secretKey = session.environment.apiKeys[0].key;

    await enableWidgetSecurityEncryption(integrationRepository, session);

    const hmacHash = createHash(secretKey, subscriberId);
    const response = await initWidgetSession(subscriberId, session, hmacHash);

    expect(response.status).to.equal(201);
  });

  it('should fail the test with invalid subscriber id or invalid secret key', async function () {
    const validSubscriberId = '12345';
    const validSecretKey = session.environment.apiKeys[0].key;
    let hmacHash;

    await enableWidgetSecurityEncryption(integrationRepository, session);

    const invalidSubscriberId = validSubscriberId + '0';
    hmacHash = createHash(validSecretKey, invalidSubscriberId);

    const responseInvalidSubscriberId = await initWidgetSession(validSubscriberId, session, hmacHash);

    const invalidSecretKey = validSecretKey + '0';
    hmacHash = createHash(invalidSecretKey, validSubscriberId);
    const responseInvalidSecretKey = await initWidgetSession(validSubscriberId, session, hmacHash);

    expect(responseInvalidSubscriberId.body.message).to.contain('Please provide a valid HMAC hash');
    expect(responseInvalidSecretKey.body.message).to.contain('Please provide a valid HMAC hash');
  });
});

async function enableWidgetSecurityEncryption(integrationRepository, session) {
  await integrationRepository.create({
    _environmentId: session.environment._id,
    _organizationId: session.organization._id,
    providerId: InAppProviderIdEnum.Novu,
    channel: ChannelTypeEnum.IN_APP,
    credentials: encryptCredentials({
      hmac: true,
    }),
    active: true,
  });
}

async function initWidgetSession(subscriberId: string, session, hmacHash?: string) {
  return await session.testAgent.post('/v1/widgets/session/initialize').send({
    applicationIdentifier: session.environment.identifier,
    subscriberId: subscriberId,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '054777777',
    hmacHash: hmacHash,
  });
}
