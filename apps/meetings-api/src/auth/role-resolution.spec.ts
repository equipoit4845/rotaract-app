import { resolveRole } from './role-resolution';

describe('resolveRole', () => {
  it('defaults to PARTICIPANT', () => {
    expect(resolveRole({})).toBe('PARTICIPANT');
    expect(resolveRole({ platformRole: 'USER', districtRoles: [] })).toBe('PARTICIPANT');
  });

  it('PRESIDENT from an ACTIVE CLUB_PRESIDENT appointment', () => {
    expect(resolveRole({ isPresident: true })).toBe('PRESIDENT');
  });

  it('SECRETARY from DISTRICT_SECRETARY or DistrictStaff', () => {
    expect(resolveRole({ districtRoles: ['SECRETARY'] })).toBe('SECRETARY');
    expect(resolveRole({ staffRole: 'SECRETARY' })).toBe('SECRETARY');
    expect(resolveRole({ staffRole: 'SECRETARY', isPresident: true })).toBe('SECRETARY');
  });

  it('RDR from DISTRICT_RDR, above SECRETARY and PRESIDENT', () => {
    expect(resolveRole({ districtRoles: ['RDR'] })).toBe('RDR');
    expect(resolveRole({ districtRoles: ['SECRETARY', 'RDR'], isPresident: true })).toBe('RDR');
    expect(resolveRole({ districtRoles: ['RDR'], staffRole: 'SECRETARY' })).toBe('RDR');
  });

  it('SUPERADMIN from platformRole or DistrictStaff wins over everything', () => {
    expect(resolveRole({ platformRole: 'SUPERADMIN' })).toBe('SUPERADMIN');
    expect(resolveRole({ staffRole: 'SUPERADMIN', districtRoles: ['RDR'], isPresident: true })).toBe('SUPERADMIN');
  });
});
