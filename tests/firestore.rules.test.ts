import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-krudesk';
const ADMIN_EMAIL = 'admin@example.com';

let testEnv: RulesTestEnvironment;

function googleToken(email: string, verified: boolean = true, provider: string = 'google.com') {
  return {
    email,
    email_verified: verified,
    firebase: {
      sign_in_provider: provider,
    },
  };
}

function getContext(uid: string, email: string, verified = true, provider = 'google.com'): RulesTestContext {
  return testEnv.authenticatedContext(uid, googleToken(email, verified, provider));
}

async function seedAdminAndUsers() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config', 'admin'), {
      email: ADMIN_EMAIL,
    });

    await setDoc(doc(db, 'users', 'pending-uid'), {
      email: 'pending@example.com',
      displayName: 'Pending Teacher',
      photoURL: '',
      status: 'pending',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'users', 'approved-uid'), {
      email: 'approved@example.com',
      displayName: 'Approved Teacher',
      photoURL: '',
      status: 'approved',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'users', 'approved2-uid'), {
      email: 'approved2@example.com',
      displayName: 'Approved Teacher 2',
      photoURL: '',
      status: 'approved',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'users', 'rejected-uid'), {
      email: 'rejected@example.com',
      displayName: 'Rejected Teacher',
      photoURL: '',
      status: 'rejected',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'users', 'disabled-uid'), {
      email: 'disabled@example.com',
      displayName: 'Disabled Teacher',
      photoURL: '',
      status: 'disabled',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'users', 'approved-uid', 'backups', 'b1'), {
      createdAt: Timestamp.now(),
      schemaVersion: 3,
      sizeBytes: 1024,
      chunkCount: 1,
      classCount: 1,
      studentCount: 30,
      sha256: 'abc123',
    });

    await setDoc(doc(db, 'users', 'approved-uid', 'backups', 'b1', 'chunks', '0'), {
      index: 0,
      data: 'H4sIAAAAAAAAA',
    });
  });
}

describe('Firestore Security Rules (§3.2 & §3.3)', () => {
  beforeAll(async () => {
    setLogLevel('silent');
    const [host = '127.0.0.1', portStr = '8088'] = (
      process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088'
    ).split(':');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host,
        port: Number(portStr),
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedAdminAndUsers();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('1. admin@example.com (verified, google.com) can read config/admin, list users, approve, reject, and disable', async () => {
    const adminDb = getContext('admin-uid', ADMIN_EMAIL).firestore();

    // Can read config/admin
    await assertSucceeds(getDoc(doc(adminDb, 'config', 'admin')));

    // Even admin cannot write config/admin from client
    await assertFails(setDoc(doc(adminDb, 'config', 'admin'), { email: 'hacker@example.com' }));

    // Can list all users
    await assertSucceeds(getDocs(collection(adminDb, 'users')));

    // Can approve a pending user
    await assertSucceeds(
      updateDoc(doc(adminDb, 'users', 'pending-uid'), {
        status: 'approved',
        reviewedBy: ADMIN_EMAIL,
        reviewedAt: serverTimestamp(),
      })
    );

    // Can reject a user
    await assertSucceeds(
      updateDoc(doc(adminDb, 'users', 'pending-uid'), {
        status: 'rejected',
        reviewedBy: ADMIN_EMAIL,
        reviewedAt: serverTimestamp(),
      })
    );

    // Can disable an approved user
    await assertSucceeds(
      updateDoc(doc(adminDb, 'users', 'approved-uid'), {
        status: 'disabled',
        reviewedBy: ADMIN_EMAIL,
        reviewedAt: serverTimestamp(),
      })
    );

    // Admin cannot add role or isAdmin fields even as admin
    await assertFails(
      updateDoc(doc(adminDb, 'users', 'approved-uid'), {
        status: 'approved',
        reviewedBy: ADMIN_EMAIL,
        reviewedAt: serverTimestamp(),
        role: 'admin',
      })
    );
  });

  it('2. another Google user cannot read/write config/admin, cannot list users, cannot change status, and cannot add role/isAdmin', async () => {
    const userDb = getContext('approved-uid', 'approved@example.com').firestore();

    // Cannot read or write config/admin
    await assertFails(getDoc(doc(userDb, 'config', 'admin')));
    await assertFails(setDoc(doc(userDb, 'config', 'admin'), { email: 'approved@example.com' }));

    // Cannot list users or read another user doc
    await assertFails(getDocs(collection(userDb, 'users')));
    await assertFails(getDoc(doc(userDb, 'users', 'pending-uid')));

    // Can read own doc and refresh own displayName / photoURL
    await assertSucceeds(getDoc(doc(userDb, 'users', 'approved-uid')));
    await assertSucceeds(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        displayName: 'Updated Name',
        photoURL: 'https://example.com/photo.png',
      })
    );

    // Cannot change own status or another user's status
    const pendingDb = getContext('pending-uid', 'pending@example.com').firestore();
    await assertFails(
      updateDoc(doc(pendingDb, 'users', 'pending-uid'), {
        status: 'approved',
      })
    );
    await assertFails(
      updateDoc(doc(userDb, 'users', 'pending-uid'), {
        status: 'approved',
        reviewedBy: 'approved@example.com',
        reviewedAt: serverTimestamp(),
      })
    );

    // Cannot add role or isAdmin field to own doc
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        role: 'admin',
      })
    );
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        isAdmin: true,
      })
    );
  });

  it('3. user with admin email but email_verified == false or sign_in_provider != google.com is NOT admin', async () => {
    const unverifiedAdminDb = getContext('admin-unverified', ADMIN_EMAIL, false, 'google.com').firestore();
    await assertFails(getDoc(doc(unverifiedAdminDb, 'config', 'admin')));
    await assertFails(getDocs(collection(unverifiedAdminDb, 'users')));
    await assertFails(
      updateDoc(doc(unverifiedAdminDb, 'users', 'pending-uid'), {
        status: 'approved',
        reviewedBy: ADMIN_EMAIL,
        reviewedAt: serverTimestamp(),
      })
    );

    const passwordAdminDb = getContext('admin-password', ADMIN_EMAIL, true, 'password').firestore();
    await assertFails(getDoc(doc(passwordAdminDb, 'config', 'admin')));
    await assertFails(getDocs(collection(passwordAdminDb, 'users')));
    await assertFails(
      updateDoc(doc(passwordAdminDb, 'users', 'pending-uid'), {
        status: 'approved',
        reviewedBy: ADMIN_EMAIL,
        reviewedAt: serverTimestamp(),
      })
    );
  });

  it('4. email case: ADMIN@example.com matches (.lower()), while an email that merely contains the admin email does not', async () => {
    const upperAdminDb = getContext('admin-upper', 'ADMIN@example.com').firestore();
    await assertSucceeds(getDoc(doc(upperAdminDb, 'config', 'admin')));
    await assertSucceeds(getDocs(collection(upperAdminDb, 'users')));
    await assertSucceeds(
      updateDoc(doc(upperAdminDb, 'users', 'pending-uid'), {
        status: 'approved',
        reviewedBy: 'ADMIN@example.com',
        reviewedAt: serverTimestamp(),
      })
    );

    // Emails that merely contain admin@example.com as a substring must fail
    const prefixSpoofDb = getContext('spoof-1', `fake.${ADMIN_EMAIL}`).firestore();
    await assertFails(getDoc(doc(prefixSpoofDb, 'config', 'admin')));
    await assertFails(getDocs(collection(prefixSpoofDb, 'users')));

    const suffixSpoofDb = getContext('spoof-2', `${ADMIN_EMAIL}.evil.com`).firestore();
    await assertFails(getDoc(doc(suffixSpoofDb, 'config', 'admin')));
    await assertFails(getDocs(collection(suffixSpoofDb, 'users')));
  });

  it('5. new user can create own doc only with status: pending; cannot create for another uid or with status: approved', async () => {
    const newUserDb = getContext('new-uid', 'newteacher@example.com').firestore();

    // Cannot create with status: 'approved'
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new-uid'), {
        email: 'newteacher@example.com',
        displayName: 'New Teacher',
        photoURL: '',
        status: 'approved',
        createdAt: serverTimestamp(),
      })
    );

    // Cannot create doc for another uid
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'someone-else-uid'), {
        email: 'newteacher@example.com',
        displayName: 'New Teacher',
        photoURL: '',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );

    // Cannot create with extra role/isAdmin key
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new-uid'), {
        email: 'newteacher@example.com',
        displayName: 'New Teacher',
        photoURL: '',
        status: 'pending',
        role: 'admin',
        createdAt: serverTimestamp(),
      })
    );

    // Can create own doc with status: 'pending' and serverTimestamp()
    await assertSucceeds(
      setDoc(doc(newUserDb, 'users', 'new-uid'), {
        email: 'newteacher@example.com',
        displayName: 'New Teacher',
        photoURL: '',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('6. pending/rejected/disabled user cannot read/write backups; approved owner can; other approved user and admin cannot read someone else\'s backups', async () => {
    // Pending user cannot read or write own backups
    const pendingDb = getContext('pending-uid', 'pending@example.com').firestore();
    await assertFails(getDoc(doc(pendingDb, 'users', 'pending-uid', 'backups', 'b1')));
    await assertFails(
      setDoc(doc(pendingDb, 'users', 'pending-uid', 'backups', 'b1'), {
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(pendingDb, 'users', 'pending-uid', 'backups', 'b1', 'chunks', '0'), {
        data: 'chunk0',
      })
    );

    // Rejected user cannot read or write own backups
    const rejectedDb = getContext('rejected-uid', 'rejected@example.com').firestore();
    await assertFails(
      setDoc(doc(rejectedDb, 'users', 'rejected-uid', 'backups', 'b1'), {
        createdAt: serverTimestamp(),
      })
    );

    // Disabled user cannot read or write own backups
    const disabledDb = getContext('disabled-uid', 'disabled@example.com').firestore();
    await assertFails(
      setDoc(doc(disabledDb, 'users', 'disabled-uid', 'backups', 'b1'), {
        createdAt: serverTimestamp(),
      })
    );

    // Approved owner CAN read, write, and delete own backups & chunks
    const approvedDb = getContext('approved-uid', 'approved@example.com').firestore();
    await assertSucceeds(getDoc(doc(approvedDb, 'users', 'approved-uid', 'backups', 'b1')));
    await assertSucceeds(
      getDoc(doc(approvedDb, 'users', 'approved-uid', 'backups', 'b1', 'chunks', '0'))
    );
    await assertSucceeds(
      setDoc(doc(approvedDb, 'users', 'approved-uid', 'backups', 'b2', 'chunks', '0'), {
        index: 0,
        data: 'chunk-payload',
      })
    );
    await assertSucceeds(
      setDoc(doc(approvedDb, 'users', 'approved-uid', 'backups', 'b2'), {
        createdAt: serverTimestamp(),
        chunkCount: 1,
      })
    );
    await assertSucceeds(
      deleteDoc(doc(approvedDb, 'users', 'approved-uid', 'backups', 'b2', 'chunks', '0'))
    );
    await assertSucceeds(deleteDoc(doc(approvedDb, 'users', 'approved-uid', 'backups', 'b2')));

    // Another approved user CANNOT read or write approved-uid's backups
    const approved2Db = getContext('approved2-uid', 'approved2@example.com').firestore();
    await assertFails(getDoc(doc(approved2Db, 'users', 'approved-uid', 'backups', 'b1')));
    await assertFails(
      getDoc(doc(approved2Db, 'users', 'approved-uid', 'backups', 'b1', 'chunks', '0'))
    );
    await assertFails(
      setDoc(doc(approved2Db, 'users', 'approved-uid', 'backups', 'b1'), {
        tampered: true,
      })
    );

    // Admin CANNOT read or write another teacher's backups
    const adminDb = getContext('admin-uid', ADMIN_EMAIL).firestore();
    await assertFails(getDoc(doc(adminDb, 'users', 'approved-uid', 'backups', 'b1')));
    await assertFails(
      getDoc(doc(adminDb, 'users', 'approved-uid', 'backups', 'b1', 'chunks', '0'))
    );
    await assertFails(
      setDoc(doc(adminDb, 'users', 'approved-uid', 'backups', 'b1'), {
        tampered: true,
      })
    );
  });

  it('7. enforces displayName (string|null <= 200) & photoURL (string|null <= 2048), blocks unauthenticated users, and prevents email change or self-delete', async () => {
    const longName = 'ក'.repeat(5000);
    const longPhoto = 'https://example.com/' + 'a'.repeat(2050);

    // Unauthenticated user cannot read or write config or users
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'config', 'admin')));
    await assertFails(setDoc(doc(unauthDb, 'config', 'admin'), { email: 'anon@example.com' }));
    await assertFails(getDoc(doc(unauthDb, 'users', 'approved-uid')));
    await assertFails(getDocs(collection(unauthDb, 'users')));
    await assertFails(
      setDoc(doc(unauthDb, 'users', 'anon-uid'), {
        email: 'anon@example.com',
        displayName: 'Anon',
        photoURL: null,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );

    // Create validation: 5000-char displayName, >2048-char photoURL, and non-string values must fail
    const newUserDb = getContext('new2-uid', 'new2@example.com').firestore();
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new2-uid'), {
        email: 'new2@example.com',
        displayName: longName,
        photoURL: null,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new2-uid'), {
        email: 'new2@example.com',
        displayName: 'Valid Name',
        photoURL: longPhoto,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new2-uid'), {
        email: 'new2@example.com',
        displayName: 12345,
        photoURL: null,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new2-uid'), {
        email: 'new2@example.com',
        displayName: 'Valid Name',
        photoURL: { url: 'https://example.com/a.png' },
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );

    // Create with null displayName and null photoURL succeeds
    await assertSucceeds(
      setDoc(doc(newUserDb, 'users', 'new2-uid'), {
        email: 'new2@example.com',
        displayName: null,
        photoURL: null,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    );

    // Self-update validation: 5000-char displayName, >2048-char photoURL, and non-string values must fail
    const userDb = getContext('approved-uid', 'approved@example.com').firestore();
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        displayName: longName,
      })
    );
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        photoURL: longPhoto,
      })
    );
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        displayName: 999,
      })
    );
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        photoURL: ['not-a-string'],
      })
    );

    // Self-update with null displayName/photoURL succeeds
    await assertSucceeds(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        displayName: null,
        photoURL: null,
      })
    );

    // User cannot change their own email and cannot delete their own doc
    await assertFails(
      updateDoc(doc(userDb, 'users', 'approved-uid'), {
        email: 'different@example.com',
      })
    );
    await assertFails(deleteDoc(doc(userDb, 'users', 'approved-uid')));
  });
});
