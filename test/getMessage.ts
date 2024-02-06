import c from './countries.json';

export type country = {
  [key: string]: string;
};

const countries: country = c;

function countryList(countryCodes: string[]): string {
  if (countryCodes.length === 0) return '';

  return countryCodes
    .map((code) => {
      const name = countries[code];
      if (!name) {
        console.log('invalid country code:', code);
        throw new Error('invalid country');
      }
      return `${name} (${code})`;
    })
    .join(', ');
}

export function getMessage(): string {

  // This does not seem to matter
  const applicationName = 'Airgrab';
  // The client ID in the dashboard
  const applicationUID = 'I28eze1-UTsP66nYyBDgiRrGCA7Oe6cRFkl7Gk0Gr1A';

  // TODO: This currently does not match the KYC level in the airgrab contract
  const level = 'basic+liveness';

  // TODO: Currently not set but should be set 
  const citizenshipCountryList: string[] = [];

  // TODO: This needs to be confirmed
  const residencyCountryList = ['CA', 'US'];

  const requestUserData = false;

  const lines = [
    `I authorize ${applicationName} (${applicationUID}) to get a proof from Fractal that:`,
    `- I passed KYC level ${level}`,
  ];

  if (citizenshipCountryList.length > 0) {
    lines.push(
      `- I am not a citizen of the following countries: ${countryList(citizenshipCountryList)}`,
    );
  }

  if (residencyCountryList.length > 0) {
    lines.push(
      `- I am not a resident of the following countries: ${countryList(residencyCountryList)}`,
    );
  }

  if (requestUserData) {
    lines.push(
      'I also allow access to my data that was used to pass this KYC level.',
    );
  }

  const message = lines.join('\n');
  return message;
}
