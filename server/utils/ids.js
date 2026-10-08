// Ids are plain strings in the JSON store but ObjectId objects (and populated documents) on MongoDB, and `===` between
// two ObjectIds is always false. Compare ids through these helpers, never with `===`.

// The id of a reference: a string, an ObjectId, or a populated document
export const idOf = (ref) => (ref === null || ref === undefined ? '' : String(ref._id ?? ref));

export const sameId = (a, b) => {
  const left = idOf(a);
  return left !== '' && left === idOf(b);
};

// A plain object from a Mongoose document (spreading a document copies its internals instead of its fields)
export const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
