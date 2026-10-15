import { addressOf, baseLocalPart, freeLocalPart } from './address';

describe('baseLocalPart', () => {
  it.each([
    ['Facundo', 'Cubells', 'facundo.cubells'],
    ['Facundo Matías', 'Cubells', 'facundo.cubells'],
    ['María José', 'González Benítez', 'maria.gonzalez'],
    ['Ñandú', 'Peña', 'nandu.pena'],
    ['Luz', 'de la Fuente', 'luz.delafuente'],
    ['Ana', 'del Valle Ríos', 'ana.delvalle'],
    ['  JUAN  ', "O'Higgins", 'juan.ohiggins'],
    ['Ana', 'D’Alessandro', 'ana.dalessandro'],
    ['Zoë', '', 'zoe'],
  ])('%s %s → %s', (first, last, expected) => {
    expect(baseLocalPart(first, last)).toBe(expected);
  });

  it('returns null without usable letters', () => {
    expect(baseLocalPart('—', '…')).toBeNull();
  });
});

describe('freeLocalPart', () => {
  it('keeps the base when it is free', async () => {
    await expect(freeLocalPart('facundo.cubells', async () => false)).resolves.toBe('facundo.cubells');
  });

  it('adds a number on a clash', async () => {
    const taken = new Set(['ana.perez', 'ana.perez2']);
    await expect(freeLocalPart('ana.perez', async (l) => taken.has(l))).resolves.toBe('ana.perez3');
  });

  it('never hands out a reserved local part', async () => {
    await expect(freeLocalPart('rdr', async () => false)).resolves.toBe('rdr2');
  });
});

it('addressOf builds the full address on the district domain', () => {
  expect(addressOf('facundo.cubells')).toBe('facundo.cubells@rotaract4845.com');
});
