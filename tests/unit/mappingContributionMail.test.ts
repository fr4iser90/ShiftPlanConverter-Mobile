jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.0.0-test' } },
}));

jest.mock('react-native', () => ({
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));

import {
  buildMappingContributionMailBody,
  buildPackPresetFragmentFromUserMappings,
} from '../../src/support/mailto';

describe('mapping contribution mail', () => {
  it('builds a pack-shaped preset fragment from userMappings', () => {
    const fragment = buildPackPresetFragmentFromUserMappings(
      {
        '13:15-21:30': 'S',
        '06:00-14:12': 'F',
        '07:00-15:00': '  ',
      },
      'Standard'
    );
    expect(fragment).toEqual({
      presets: {
        Standard: {
          '06:00-14:12': { code: 'F', type: 'work', isValidated: false },
          '13:15-21:30': { code: 'S', type: 'work', isValidated: false },
        },
      },
    });
  });

  it('includes workplace meta and JSON fragment in the mail body', () => {
    const body = buildMappingContributionMailBody({
      hospital: 'st-elisabeth-leipzig',
      group: 'pflege',
      area: 'station-1',
      preset: 'Standard',
      userMappings: { '06:00-14:12': 'F' },
    });
    expect(body).toContain('st-elisabeth-leipzig');
    expect(body).toContain('station-1');
    expect(body).toContain('"06:00-14:12"');
    expect(body).toContain('"code": "F"');
    expect(body).toContain('"isValidated": false');
  });
});
