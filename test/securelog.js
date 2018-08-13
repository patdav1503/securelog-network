/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write the unit tests for your transction processor functions here
 */

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const namespace = 'org.securelog.mynetwork';
const assetType = 'ErrorMessage';
const assetNS = namespace + '.' + assetType;
const participantType = 'Member';
const participantType2 = 'Level2';
const participantType3 = 'Level3';
const participantType4 = 'System';
const participantNS = namespace + '.' + participantType;

describe('#' + namespace, () => {
    // In-memory card store for testing so cards are not persisted to the file system
    const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Name of the business network card containing the administrative identity for the business network
    const adminCardName = 'admin';

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let businessNetworkConnection;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Alice and Bob.
    const aliceCardName = 'alice';
    const bobCardName = 'bob';
    const georgeCardName = 'george';
    const systemCardName = 'system';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = businessNetworkDefinition.getName();
        await adminConnection.install(businessNetworkDefinition);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkName, businessNetworkDefinition.getVersion(), startOptions);
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

        // Create and establish a business network connection
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', event => {
            events.push(event);
        });
        await businessNetworkConnection.connect(adminCardName);

        // Get the factory for the business network.
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        const participantRegistry = await businessNetworkConnection.getParticipantRegistry(namespace + '.' + participantType);
        const participantRegistry2 = await businessNetworkConnection.getParticipantRegistry(namespace + '.' + participantType2);
        const participantRegistry3 = await businessNetworkConnection.getParticipantRegistry(namespace + '.' + participantType3);
        const participantRegistry4 = await businessNetworkConnection.getParticipantRegistry(namespace + '.' + participantType4);
        // Create the participants.
        const alice = factory.newResource(namespace, participantType, 'alice@email.com');
        alice.firstName = 'Alice';
        alice.lastName = 'A';

        const bob = factory.newResource(namespace, participantType2, 'bob@email.com');
        bob.firstName = 'Bob';
        bob.lastName = 'B';

        const george = factory.newResource(namespace, participantType3, 'george@email.com');
        george.firstName = 'George';
        george.lastName = 'G';

        const system = factory.newResource(namespace, participantType4, 'system@email.com');
        system.firstName = 'System';
        system.lastName = 'S';

        participantRegistry.addAll([alice]);
        participantRegistry2.addAll([bob]);
        participantRegistry3.addAll([george]);
        participantRegistry4.addAll([system]);

        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        // Create the assets.
        const asset1 = factory.newResource(namespace, assetType, '1');
        asset1.creator = factory.newRelationship(namespace, participantType4, 'system@email.com');
        asset1.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset1.errorType = 'Math Module';
        asset1.errorSeverity = 'CRITICAL';
        asset1.errorStatus = 'NEW';
        asset1.errorText = 'Exception in function multiply';

        const asset2 = factory.newResource(namespace, assetType, '2');
        asset2.creator = factory.newRelationship(namespace, participantType4, 'system@email.com');
        asset2.owner = factory.newRelationship(namespace, participantType2, 'bob@email.com');
        asset2.errorType = 'Math Module';
        asset2.errorSeverity = 'WARNING';
        asset2.errorStatus = 'NEW';
        asset2.errorText = 'A non-fatal error has occurred in function add';

        assetRegistry.addAll([asset1, asset2]);

        // Issue the identities.
        let identity = await businessNetworkConnection.issueIdentity(participantNS + '#alice@email.com', 'alice1');
        await importCardForIdentity(aliceCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(namespace + '.' + participantType2 + '#bob@email.com', 'bob1');
        await importCardForIdentity(bobCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(namespace + '.' + participantType3 + '#george@email.com', 'george1');
        await importCardForIdentity(georgeCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(namespace + '.' + participantType4 + '#system@email.com', 'system1');
        await importCardForIdentity(systemCardName, identity);
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await businessNetworkConnection.disconnect();
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', (event) => {
            events.push(event);
        });
        await businessNetworkConnection.connect(cardName);
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    }

    it('Alice can read all of the assets', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.creator.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType4 + '#system@email.com');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.errorText.should.equal('Exception in function multiply');
        const asset2 = assets[1];
        asset2.creator.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType4 + '#system@email.com');
        asset2.owner.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType2 + '#bob@email.com');
        asset2.errorText.should.equal('A non-fatal error has occurred in function add');
    });

    it('Bob can read only one asset', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(1);
        const asset1 = assets[0];
        asset1.creator.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType4 + '#system@email.com');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType2 + '#bob@email.com');
        asset1.errorText.should.equal('A non-fatal error has occurred in function add');
    });

    it('George can read all of the assets', async () => {
        // Use the identity for Alice.
        await useIdentity(georgeCardName);
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        const assets = await assetRegistry.getAll();

        // Validate the assets.
        assets.should.have.lengthOf(2);
        const asset1 = assets[0];
        asset1.creator.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType4 + '#system@email.com');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.errorText.should.equal('Exception in function multiply');
        const asset2 = assets[1];
        asset2.creator.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType4 + '#system@email.com');
        asset2.owner.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType2 + '#bob@email.com');
        asset2.errorText.should.equal('A non-fatal error has occurred in function add');
    });

    it('System can add assets that it owns', async () => {
        // Use the identity for Alice.
        await useIdentity(systemCardName);

        // Create the asset.
        let asset3 = factory.newResource(namespace, assetType, '3');
        asset3.creator = factory.newRelationship(namespace, participantType4, 'system@email.com');
        asset3.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset3.errorType = 'Math Module';
        asset3.errorSeverity = 'WARNING';
        asset3.errorStatus = 'NEW';
        asset3.errorText = 'A non-fatal error has occurred in function subtract';

        // Add the asset, then get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.add(asset3);

        // Validate the asset.
        asset3 = await assetRegistry.get('3');
        asset3.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset3.errorText.should.equal('A non-fatal error has occurred in function subtract');
    });

    it('Alice cannot add assets that Bob owns', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const asset3 = factory.newResource(namespace, assetType, '3');
        asset3.creator = factory.newRelationship(namespace, participantType4, 'system@email.com');
        asset3.owner = factory.newRelationship(namespace, participantType3, 'bob@email.com');
        asset3.errorType = 'Math Module';
        asset3.errorSeverity = 'WARNING';
        asset3.errorStatus = 'NEW';
        asset3.errorText = 'A non-fatal error has occurred in function subtract';

        // Try to add the asset, should fail.
        const assetRegistry = await  businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.add(asset3).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Alice cannot add assets where she is creator', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const asset3 = factory.newResource(namespace, assetType, '3');
        asset3.creator = factory.newRelationship(namespace, participantType, 'alice@email.com');
        asset3.owner = factory.newRelationship(namespace, participantType3, 'bob@email.com');
        asset3.errorType = 'Math Module';
        asset3.errorSeverity = 'WARNING';
        asset3.errorStatus = 'NEW';
        asset3.errorText = 'A non-fatal error has occurred in function subtract';

        // Try to add the asset, should fail.
        const assetRegistry = await  businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.add(asset3).should.be.rejectedWith(/that is not derived from org.securelog.mynetwork.System/);
    });

    it('Bob cannot add assets where he is creator', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const asset3 = factory.newResource(namespace, assetType, '3');
        asset3.creator = factory.newRelationship(namespace, participantType, 'bob@email.com');
        asset3.owner = factory.newRelationship(namespace, participantType3, 'bob@email.com');
        asset3.errorType = 'Math Module';
        asset3.errorSeverity = 'WARNING';
        asset3.errorStatus = 'NEW';
        asset3.errorText = 'A non-fatal error has occurred in function subtract';

        // Try to add the asset, should fail.
        const assetRegistry = await  businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.add(asset3).should.be.rejectedWith(/that is not derived from org.securelog.mynetwork.System/);
    });

    it('Alice can remove her assets', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.remove('1');
        const exists = await assetRegistry.exists('1');
        exists.should.be.false;
    });

    it('Alice cannot remove Bob\'s assets', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('2').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob can remove his assets', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        await assetRegistry.remove('2');
        const exists = await assetRegistry.exists('2');
        exists.should.be.false;
    });

    it('Bob cannot remove Alice\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Remove the asset, then test the asset exists.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        assetRegistry.remove('1').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Alice can update her assets', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        let asset1 = await assetRegistry.get('1');
        asset1.errorText = 'Exception in function multiply, result exceeds storage';

        // Update the asset, then get the asset.
        await assetRegistry.update(asset1);

        // Validate the asset.
        asset1 = await assetRegistry.get('1');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(participantNS + '#alice@email.com');
        asset1.errorStatus.should.equal('NEW');
        asset1.errorText.should.equal('Exception in function multiply, result exceeds storage');
    });

    it('Alice cannot update Bob\'s assets', async () => {
        // Use the identity for Alice.
        await useIdentity(aliceCardName);

        // Create the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        let asset2 = await assetRegistry.get('2');
        asset2.errorText = 'Exception in function multiply, result exceeds storage';

        // Try to update the asset, should fail.
        assetRegistry.update(asset2).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('Bob can update his assets', async () => {
        // Use the identity for Alice.
        await useIdentity(bobCardName);

        // Create the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        let asset1 = await assetRegistry.get('2');
        asset1.errorText = 'A non-fatal error has occurred in function add, result exceeds storage';

        // Update the asset, then get the asset.
        await assetRegistry.update(asset1);

        // Validate the asset.
        asset1 = await assetRegistry.get('2');
        asset1.owner.getFullyQualifiedIdentifier().should.equal(namespace + '.' + participantType2 + '#bob@email.com');
        asset1.errorStatus.should.equal('NEW');
        asset1.errorText.should.equal('A non-fatal error has occurred in function add, result exceeds storage');
    });

    it('Bob cannot see Alice\'s assets', async () => {
        // Use the identity for Bob.
        await useIdentity(bobCardName);

        // Create the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        let asset2 = await assetRegistry.get('1').should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('George cannot update Alice\'s assets', async () => {
        // Use the identity for George.
        await useIdentity(georgeCardName);

        // Create the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        let asset2 = await assetRegistry.get('1');
        asset2.errorText = 'Exception in function multiply, result exceeds storage';

        // Try to update the asset, should fail.
        assetRegistry.update(asset2).should.be.rejectedWith(/does not have .* access to resource/);
    });

    it('George cannot update Bob\'s assets', async () => {
        // Use the identity for George.
        await useIdentity(georgeCardName);

        // Create the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry(assetNS);
        let asset2 = await assetRegistry.get('2');
        asset2.errorText = 'Exception in function multiply, result exceeds storage';

        // Try to update the asset, should fail.
        assetRegistry.update(asset2).should.be.rejectedWith(/does not have .* access to resource/);
    });


});
