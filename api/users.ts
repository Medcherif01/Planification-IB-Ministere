import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION = 'users';
const STUDENTS_COLLECTION = 'class_students';
const EVAL_COLLECTION = 'online_evaluations';
const SUB_COLLECTION = 'online_submissions';
const BOOKLETS_COLLECTION = 'student_booklets';

let cachedClient: MongoClient | null = null;
let connectingPromise: Promise<MongoClient | null> | null = null;
let mongoRetryAfter = 0;
let inMemoryStudents: any[] = [];

function normalizeMatStrict(val: any): string {
  return String(val || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
}

function normalizeMatDisplay(val: any): string {
  return String(val || '').trim().toUpperCase();
}

function normalizeStudentNameKey(val: any): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateStudentId(): string {
  try {
    if (typeof crypto.randomUUID === 'function') {
      return `stu_${crypto.randomUUID()}`;
    }
  } catch {}
  return `stu_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

// Simple password hash (SHA-256 via Web Crypto — available in Node 18+)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'alkawtar_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// In-memory users store fallback (Mohamed2020 uniquement comme administrateur)
const inMemoryUsers: any[] = [
  {
    id: 'user_admin_mohamed',
    _id: 'user_admin_mohamed',
    username: 'Mohamed2020',
    passwordHash: 'bb3caa892402611beda12f7c87ee1dcc208b3ca854235f8c5ce2ed77a2d480ec', // 120786Mmed
    role: 'admin',
    displayName: 'Mohamed (Administrateur)',
    subjects: [],
    createdAt: new Date().toISOString(),
    isActive: true,
  }
];

async function getDB() {
  if (!MONGO_URL) return null;
  if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) return null;

  if (cachedClient) {
    return cachedClient.db(DB_NAME);
  }
  if (Date.now() < mongoRetryAfter) {
    return null;
  }
  if (connectingPromise) {
    const c = await connectingPromise;
    return c ? c.db(DB_NAME) : null;
  }

  connectingPromise = (async () => {
    try {
      const client = new MongoClient(MONGO_URL, {
        serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
        maxPoolSize: 50,
        minPoolSize: 2,
        maxIdleTimeMS: 60_000,
        connectTimeoutMS: 10_000,
        socketTimeoutMS: 25_000,
        serverSelectionTimeoutMS: 10_000,
        retryWrites: true,
        retryReads: true,
      });
      await client.connect();
      client.on('topologyClosed', () => {
        if (cachedClient === client) cachedClient = null;
      });
      cachedClient = client;
      mongoRetryAfter = 0;
      return client;
    } catch (_) {
      mongoRetryAfter = Date.now() + 10_000;
      return null;
    } finally {
      connectingPromise = null;
    }
  })();

  const client = await connectingPromise;
  return client ? client.db(DB_NAME) : null;
}

// Seed admin user or migrate old Mohamed to Mohamed2020
async function seedAdminIfNeeded(db: ReturnType<MongoClient['db']>) {
  const col = db.collection(COLLECTION);
  const oldAdmin = await col.findOne({ username: 'Mohamed' });
  if (oldAdmin) {
    const newHash = await hashPassword('120786Mmed');
    await col.updateOne(
      { username: 'Mohamed' },
      { $set: { username: 'Mohamed2020', passwordHash: newHash } }
    );
    console.log('[Users] Admin migré de Mohamed vers Mohamed2020');
  }

  // Supprimer tout ancien compte Alkawthar pour ne garder que Mohamed2020
  await col.deleteMany({ username: { $regex: /^alkawthar$/i } });

  const count = await col.countDocuments({ username: 'Mohamed2020' });
  if (count === 0) {
    const adminHash = await hashPassword('120786Mmed');
    await col.insertOne({
      username: 'Mohamed2020',
      passwordHash: adminHash,
      role: 'admin',
      displayName: 'Mohamed (Administrateur)',
      subjects: [], // Admin accède à tout
      createdAt: new Date().toISOString(),
      isActive: true,
    });
    console.log('[Users] Admin par défaut créé: Mohamed2020');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Username');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const db = await getDB();

    // ══════════════════════════════════════════════════════════════════════════
    // GESTION DES ÉLÈVES PAR CLASSE (/api/users?entity=students)
    // ══════════════════════════════════════════════════════════════════════════
    if (req.query.entity === 'students') {
      const gradeFilter = typeof req.query.grade === 'string' ? req.query.grade.trim() : '';
      const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';

      if (!db) {
        res.setHeader('X-Storage-Mode', 'in-memory');
        if (req.method === 'GET') {
          const list = gradeFilter
            ? inMemoryStudents.filter(s => s.grade === gradeFilter)
            : inMemoryStudents;
          return res.status(200).json(list);
        }
        if (req.method === 'POST' && action === 'replace_matricules') {
          const { replacements } = req.body || {};
          if (!Array.isArray(replacements)) {
            return res.status(400).json({ error: 'Tableau replacements requis' });
          }
          let updatedCount = 0;
          for (const rep of replacements) {
            const oldStrict = normalizeMatStrict(rep?.oldMatricule);
            const newDisplay = normalizeMatDisplay(rep?.newMatricule);
            const targetId = rep?.studentId ? String(rep.studentId) : '';
            const targetNameKey = normalizeStudentNameKey(rep?.studentName);
            const targetGrade = rep?.grade ? String(rep.grade).trim() : '';

            if (!newDisplay) continue;
            for (let i = 0; i < inMemoryStudents.length; i++) {
              const s = inMemoryStudents[i];
              const matchesId = Boolean(targetId && s.id === targetId);
              const matchesOld = Boolean(oldStrict && normalizeMatStrict(s.studentNumber) === oldStrict);
              const matchesName = Boolean(
                targetNameKey &&
                normalizeStudentNameKey(s.name) === targetNameKey &&
                (!targetGrade || s.grade === targetGrade)
              );
              if (matchesId || matchesOld || matchesName) {
                inMemoryStudents[i] = {
                  ...s,
                  name: rep?.studentName?.trim() || s.name,
                  studentNumber: newDisplay,
                };
                updatedCount++;
              }
            }
          }
          return res.status(200).json({ success: true, updatedCount, students: inMemoryStudents });
        }
        if (req.method === 'POST') {
          const { students, grade, replaceGrade } = req.body || {};
          if (Array.isArray(students)) {
            if (replaceGrade && grade) {
              inMemoryStudents = inMemoryStudents.filter(s => s.grade !== grade);
            }
            for (const st of students) {
              if (!st || !st.name) continue;
              const targetGrade = String(st.grade || grade || 'PEI 1').trim();
              const cleanName = String(st.name).trim();
              const nameKey = normalizeStudentNameKey(cleanName);
              const cleanMat = normalizeMatDisplay(st.studentNumber || '');
              const existingIdx = inMemoryStudents.findIndex(
                x =>
                  (st.id && x.id === st.id) ||
                  (x.grade === targetGrade && normalizeStudentNameKey(x.name) === nameKey)
              );
              const existing = existingIdx >= 0 ? inMemoryStudents[existingIdx] : null;
              const id = existing?.id || st.id || generateStudentId();
              const record = {
                id,
                name: cleanName,
                studentNumber: cleanMat || existing?.studentNumber || '',
                grade: targetGrade,
                birthDate: st.birthDate !== undefined ? String(st.birthDate).trim() : (existing?.birthDate || ''),
                photoUrl: st.photoUrl !== undefined ? String(st.photoUrl).trim() : (existing?.photoUrl || ''),
                createdAt: existing?.createdAt || st.createdAt || new Date().toISOString(),
              };
              if (existingIdx >= 0) inMemoryStudents[existingIdx] = record;
              else inMemoryStudents.push(record);
            }
            return res.status(200).json({ success: true, count: inMemoryStudents.length, students: inMemoryStudents });
          }
          return res.status(400).json({ error: 'Tableau students requis' });
        }
        if (req.method === 'DELETE') {
          const { id, grade } = req.query;
          if (id) {
            inMemoryStudents = inMemoryStudents.filter(s => s.id !== id);
          } else if (grade) {
            inMemoryStudents = inMemoryStudents.filter(s => s.grade !== grade);
          }
          return res.status(200).json({ success: true });
        }
        return res.status(200).json({ success: true });
      }

      const stuCol = db.collection(STUDENTS_COLLECTION);
      if (req.method === 'GET') {
        const query = gradeFilter ? { grade: gradeFilter } : {};
        const docs = await stuCol.find(query).toArray();
        return res.status(200).json(docs.map(d => ({ ...d, id: d.id || d._id.toString() })));
      }

      // Remplacement atomique d'un ou plusieurs matricules dans class_students + evaluations + submissions + booklets
      if (req.method === 'POST' && action === 'replace_matricules') {
        const { replacements } = req.body || {};
        if (!Array.isArray(replacements)) {
          return res.status(400).json({ error: 'Tableau replacements requis' });
        }

        const evalCol = db.collection(EVAL_COLLECTION);
        const subCol = db.collection(SUB_COLLECTION);
        const bookletCol = db.collection(BOOKLETS_COLLECTION);

        let updatedStudents = 0;
        let updatedEvaluations = 0;
        let updatedSubmissions = 0;
        let updatedBooklets = 0;

        const allStudents = await stuCol.find({}).toArray();
        const allEvals = await evalCol.find({ studentAccessCodes: { $exists: true } }).toArray();

        for (const rep of replacements) {
          const oldRaw = String(rep?.oldMatricule || '').trim();
          const oldStrict = normalizeMatStrict(oldRaw);
          const newDisplay = normalizeMatDisplay(rep?.newMatricule);
          const newStrict = normalizeMatStrict(newDisplay);
          const targetId = rep?.studentId ? String(rep.studentId).trim() : '';
          const targetNameKey = normalizeStudentNameKey(rep?.studentName);
          const targetGrade = rep?.grade ? String(rep.grade).trim() : '';

          if (!newDisplay) continue;

          // 1. Remplacer dans class_students (et éviter tout doublon portant l'ancien matricule)
          const matchingStudents = allStudents.filter(s => {
            const byId = Boolean(targetId && s.id === targetId);
            const byOld = Boolean(oldStrict && normalizeMatStrict(s.studentNumber) === oldStrict);
            const byName = Boolean(
              targetNameKey &&
              normalizeStudentNameKey(s.name) === targetNameKey &&
              (!targetGrade || s.grade === targetGrade)
            );
            return byId || byOld || byName;
          });

          if (matchingStudents.length > 0) {
            const primary = matchingStudents[0];
            const stuUpdate: Record<string, any> = { studentNumber: newDisplay };
            if (rep?.studentName && String(rep.studentName).trim()) {
              stuUpdate.name = String(rep.studentName).trim();
            }
            await stuCol.updateOne({ _id: primary._id }, { $set: stuUpdate });
            primary.studentNumber = newDisplay;
            updatedStudents++;

            // Supprimer les éventuels doublons résiduels du même élève dans la même classe
            if (matchingStudents.length > 1) {
              const dupIds = matchingStudents.slice(1).map(d => d._id);
              await stuCol.deleteMany({ _id: { $in: dupIds } });
            }
          }

          if (!oldStrict || oldStrict === newStrict) continue;

          // 2. Remplacer dans online_evaluations.studentAccessCodes
          for (const ev of allEvals) {
            if (!Array.isArray(ev.studentAccessCodes)) continue;
            let changed = false;
            const mapped = ev.studentAccessCodes.map((sc: any) => {
              if (!sc) return sc;
              const scStrict = normalizeMatStrict(sc.studentNumber);
              const scNameKey = normalizeStudentNameKey(sc.studentName);
              if (
                scStrict === oldStrict ||
                (targetNameKey && scNameKey === targetNameKey && scStrict !== newStrict)
              ) {
                changed = true;
                return {
                  ...sc,
                  studentNumber: newDisplay,
                  studentName: rep?.studentName?.trim() || sc.studentName,
                };
              }
              return sc;
            });

            if (changed) {
              // Dédupliquer si le nouveau matricule existait déjà
              const deduped: any[] = [];
              const seen = new Map<string, number>();
              for (const item of mapped) {
                const k = normalizeMatStrict(item?.studentNumber);
                if (!k) { deduped.push(item); continue; }
                const prevIdx = seen.get(k);
                if (prevIdx === undefined) {
                  seen.set(k, deduped.length);
                  deduped.push(item);
                } else {
                  const prev = deduped[prevIdx];
                  deduped[prevIdx] = {
                    ...prev,
                    ...item,
                    studentName: item.studentName || prev.studentName,
                    isUsed: Boolean(prev.isUsed || item.isUsed),
                    usedAt: prev.usedAt || item.usedAt,
                    submissionId: prev.submissionId || item.submissionId,
                    allowedRetake: Boolean(prev.allowedRetake || item.allowedRetake),
                  };
                }
              }
              ev.studentAccessCodes = deduped;
              await evalCol.updateOne({ _id: ev._id }, { $set: { studentAccessCodes: deduped } });
              updatedEvaluations++;
            }
          }

          // 3. Remplacer dans online_submissions
          const escapedOld = escapeRegex(oldRaw);
          const subUpdate: Record<string, any> = {
            studentNumber: newDisplay,
            normalizedStudentNumber: newStrict,
          };
          if (rep?.studentName && String(rep.studentName).trim()) {
            subUpdate.studentName = String(rep.studentName).trim();
          }
          const subRes = await subCol.updateMany(
            {
              $or: [
                { normalizedStudentNumber: oldStrict },
                { studentNumber: { $regex: new RegExp(`^\\s*${escapedOld}\\s*$`, 'i') } },
              ],
            },
            { $set: subUpdate }
          );
          updatedSubmissions += subRes.modifiedCount || 0;

          // 4. Remplacer dans student_booklets
          const bookletFilter: any = {
            $or: [
              { studentNumber: { $regex: new RegExp(`^\\s*${escapedOld}\\s*$`, 'i') } },
              ...(targetId ? [{ studentId: targetId }] : []),
            ],
          };
          const bRes = await bookletCol.updateMany(bookletFilter, {
            $set: {
              studentNumber: newDisplay,
              ...(rep?.studentName?.trim() ? { studentName: rep.studentName.trim() } : {}),
            },
          });
          updatedBooklets += bRes.modifiedCount || 0;
        }

        return res.status(200).json({
          success: true,
          updatedStudents,
          updatedEvaluations,
          updatedSubmissions,
          updatedBooklets,
        });
      }

      if (req.method === 'POST') {
        const { students, grade, replaceGrade } = req.body || {};
        if (!Array.isArray(students)) {
          return res.status(400).json({ error: 'Tableau students requis' });
        }
        if (replaceGrade && grade) {
          await stuCol.deleteMany({ grade });
        }
        const existingInDb = await stuCol.find(grade ? { grade } : {}).toArray();

        for (const st of students) {
          if (!st || !st.name) continue;
          const targetGrade = String(st.grade || grade || 'PEI 1').trim();
          const cleanName = String(st.name).trim();
          const nameKey = normalizeStudentNameKey(cleanName);
          const cleanMat = normalizeMatDisplay(st.studentNumber || '');

          const existing = existingInDb.find(
            x =>
              (st.id && x.id === st.id) ||
              (x.grade === targetGrade && normalizeStudentNameKey(x.name) === nameKey)
          );
          const id = existing?.id || st.id || generateStudentId();
          const record = {
            id,
            name: cleanName,
            studentNumber: cleanMat || existing?.studentNumber || '',
            grade: targetGrade,
            birthDate: st.birthDate !== undefined ? String(st.birthDate).trim() : (existing?.birthDate || ''),
            photoUrl: st.photoUrl !== undefined ? String(st.photoUrl).trim() : (existing?.photoUrl || ''),
            createdAt: existing?.createdAt || st.createdAt || new Date().toISOString(),
          };
          await stuCol.updateOne({ id }, { $set: record }, { upsert: true });
        }
        const updated = await stuCol.find(grade ? { grade } : {}).toArray();
        return res.status(200).json({
          success: true,
          students: updated.map(d => ({ ...d, id: d.id || d._id.toString() })),
        });
      }
      if (req.method === 'DELETE') {
        const { id, grade } = req.query;
        if (id) {
          await stuCol.deleteOne({ id: String(id) });
        } else if (grade) {
          await stuCol.deleteMany({ grade: String(grade) });
        }
        return res.status(200).json({ success: true });
      }
      return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    // In-memory fallback
    if (!db) {
      res.setHeader('X-Storage-Mode', 'in-memory');

      if (req.method === 'POST' && req.query.action === 'login') {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
        const cleanUser = String(username).trim().toLowerCase();
        if (cleanUser === 'alkawthar' || cleanUser === 'mohamed') {
          return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        const hash = await hashPassword(password);
        const user = inMemoryUsers.find(u => u.username?.toLowerCase() === cleanUser && u.passwordHash === hash && u.isActive !== false);
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
        return res.status(200).json({
          success: true,
          user: {
            id: user.id || user._id,
            username: user.username,
            role: user.role,
            displayName: user.displayName,
            subjects: user.subjects || [],
          },
        });
      }

      if (req.method === 'GET') {
        return res.status(200).json(inMemoryUsers.map(u => ({ ...u, passwordHash: undefined })));
      }

      if (req.method === 'POST') {
        const { username, password, displayName, subjects } = req.body;
        if (!username || !password || !displayName) return res.status(400).json({ error: 'username, password et displayName requis' });
        const cleanUser = String(username).trim().toLowerCase();
        if (cleanUser === 'alkawthar' || cleanUser === 'mohamed') {
          return res.status(400).json({ error: 'Nom d\'utilisateur non autorisé' });
        }
        const hash = await hashPassword(password);
        const id = `user_${Date.now()}`;
        const newUser = { id, _id: id, username, passwordHash: hash, role: 'teacher', displayName, subjects: subjects || [], createdAt: new Date().toISOString(), isActive: true };
        inMemoryUsers.push(newUser);
        return res.status(201).json({ success: true, id });
      }

      return res.status(200).json({ success: true });
    }

    const col = db.collection(COLLECTION);
    await seedAdminIfNeeded(db);

    // ── POST /api/users?action=login ─────────────────────────────────────────
    if (req.method === 'POST' && req.query.action === 'login') {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'username et password requis' });
      }
      const cleanUser = String(username).trim().toLowerCase();
      if (cleanUser === 'alkawthar' || cleanUser === 'mohamed') {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
      const hash = await hashPassword(password);
      const user = await col.findOne({ username: { $regex: new RegExp(`^${escapeRegex(cleanUser)}$`, 'i') }, passwordHash: hash, isActive: true });
      if (!user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
      return res.status(200).json({
        success: true,
        user: {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          displayName: user.displayName,
          subjects: user.subjects || [],
        },
      });
    }

    // ── GET /api/users — Liste tous les utilisateurs (admin only) ────────────
    if (req.method === 'GET') {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const users = await col.find({}, {
        projection: { passwordHash: 0 }
      }).toArray();
      return res.status(200).json(users.map(u => ({ ...u, id: u._id.toString() })));
    }

    // ── POST /api/users — Créer un enseignant (admin only) ──────────────────
    if (req.method === 'POST' && !req.query.action) {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const { username, password, displayName, subjects } = req.body;
      if (!username || !password || !displayName) {
        return res.status(400).json({ error: 'username, password et displayName requis' });
      }
      const existing = await col.findOne({ username });
      if (existing) {
        return res.status(409).json({ error: 'Ce nom d\'utilisateur existe déjà' });
      }
      const hash = await hashPassword(password);
      const result = await col.insertOne({
        username,
        passwordHash: hash,
        role: 'teacher',
        displayName,
        subjects: subjects || [],
        createdAt: new Date().toISOString(),
        isActive: true,
      });
      return res.status(201).json({ success: true, id: result.insertedId.toString() });
    }

    // ── PUT /api/users/:id — Modifier un enseignant (admin only) ─────────────
    if (req.method === 'PUT') {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });
      const { username, password, displayName, subjects, isActive } = req.body;
      const update: Record<string, unknown> = {};
      if (username !== undefined) update.username = username;
      if (displayName !== undefined) update.displayName = displayName;
      if (subjects !== undefined) update.subjects = subjects;
      if (isActive !== undefined) update.isActive = isActive;
      if (password) update.passwordHash = await hashPassword(password);
      update.updatedAt = new Date().toISOString();
      await col.updateOne({ _id: new ObjectId(id as string) }, { $set: update });
      return res.status(200).json({ success: true });
    }

    // ── DELETE /api/users/:id — Supprimer un enseignant (admin only) ──────────
    if (req.method === 'DELETE') {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });
      await col.deleteOne({ _id: new ObjectId(id as string) });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (error: any) {
    console.warn('[API users] Fallback:', error?.message);
    return res.status(200).json(inMemoryUsers.map(u => ({ ...u, passwordHash: undefined })));
  }
}
