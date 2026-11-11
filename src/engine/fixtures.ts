export const OPENEMR_DEMOGRAPHICS = `
<form id="demographics">
  <table>
    <tr><td><label for="form_fname">First Name</label></td><td><input id="form_fname" name="form_fname"></td></tr>
    <tr><td><label for="form_lname">Last Name</label></td><td><input id="form_lname" name="form_lname"></td></tr>
    <tr><td><label for="form_DOB">Date of Birth</label></td><td><input id="form_DOB" name="form_DOB"></td></tr>
    <tr><td><label for="form_sex">Sex</label></td><td>
      <select id="form_sex" name="form_sex"><option value=""></option><option value="Female">Female</option><option value="Male">Male</option></select>
    </td></tr>
    <tr><td><label for="form_pubpid">External ID</label></td><td><input id="form_pubpid" name="form_pubpid"></td></tr>
    <tr><td><label for="form_phone_home">Home Phone</label></td><td><input id="form_phone_home" name="form_phone_home" value="(508) 555-0199"></td></tr>
    <tr><td><label for="form_email">Email</label></td><td><input id="form_email" name="form_email" type="email"></td></tr>
    <tr><td><label for="form_street">Address</label></td><td><input id="form_street" name="form_street"></td></tr>
    <tr><td><label for="language">Preferred language</label></td><td><input id="language" name="language"></td></tr>
    <tr><td><label for="password">Password</label></td><td><input id="password" name="password" type="password" value="secret"></td></tr>
  </table>
</form>`;

export const OPENMRS_REGISTRATION = `
<form id="registration">
  <label for="givenName">Given Name</label><input id="givenName" name="givenName">
  <label for="familyName">Family Name</label><input id="familyName" name="familyName">
  <label for="birthdate">Birthdate</label><input id="birthdate" name="birthdate" type="date">
  <label for="gender">Gender</label>
  <select id="gender" name="gender"><option value=""></option><option value="F">F</option><option value="M">M</option></select>
  <label for="identifier">Identifier</label><input id="identifier" name="identifier">
  <label for="phoneNumber">Phone Number</label><input id="phoneNumber" name="phoneNumber">
  <label for="address1">Address</label><input id="address1" name="address1">
  <input type="hidden" name="secretToken" value="hide-me">
</form>`;

/** Fields taken from the live OpenEMR 8 demo Search or Add Patient form. Titles are how that page names its boxes. */
export const OPENEMR_NEW_PATIENT = `
<form id="new-patient">
  <input id="form_fname" name="form_fname" placeholder="First Name" title="First Name">
  <input id="form_mname" name="form_mname" placeholder="Middle Name" title="Middle Name">
  <input id="form_lname" name="form_lname" placeholder="Last Name" title="Last Name">
  <input id="form_preferred_name" name="form_preferred_name" title="Preferred Name">
  <input id="form_pubpid" name="form_pubpid" title="External identifier">
  <input id="form_DOB" name="form_DOB" title="Date of Birth">
  <select id="form_sex" name="form_sex" title="Birth Sex"><option value="">Unassigned</option><option value="Female">Female</option><option value="Male">Male</option></select>
  <input id="form_ss" name="form_ss" title="Social Security Number">
  <input id="form_birth_fname" name="form_birth_fname" placeholder="Birth First Name" title="Birth First Name">
  <input id="form_birth_lname" name="form_birth_lname" placeholder="Birth Last Name" title="Birth Last Name">
  <select id="form_gender_identity" name="form_gender_identity" title="Gender Identity"><option value="">Unassigned</option><option value="Female">Identifies as Female</option></select>
  <select id="form_sexual_orientation" name="form_sexual_orientation" title="Sexual Orientation"><option value="">Unassigned</option><option value="straight">Straight or heterosexual</option></select>
  <input id="form_street" name="form_street" title="Street and Number">
  <input id="form_street_line_2" name="form_street_line_2" title="Address Line 2">
  <input id="form_city" name="form_city" title="City Name">
  <select id="form_state" name="form_state" title="State/Locality"><option value="">Unassigned</option><option value="CA">California</option><option value="MA">Massachusetts</option></select>
  <input id="form_postal_code" name="form_postal_code" title="Postal Code">
  <select id="form_country_code" name="form_country_code" title="Country"><option value="">Unassigned</option><option value="USA">USA</option></select>
  <input id="form_phone_contact" name="form_phone_contact" title="Emergency Contact Phone Number">
  <input id="form_phone_home" name="form_phone_home" title="Home Phone Number">
  <input id="form_phone_biz" name="form_phone_biz" title="Work Phone Number">
  <input id="form_phone_cell" name="form_phone_cell" title="Cell Phone Number">
  <input id="form_email" name="form_email" title="Contact Email Address">
</form>`;

export const OPENEMR_CALENDAR = `
<table id="appointments">
  <tr id="emily"><td>Name</td><td>Emily Carter</td></tr>
  <tr id="james"><td>Name</td><td>James Anderson</td></tr>
</table>`;

export const SYNTHETIC_PATIENT = {
  id: "22222222-2222-4222-8222-222222222222",
  firstName: "Jane",
  lastName: "Doe",
  middleName: null,
  name: "Jane Doe",
  dateOfBirth: "1984-03-12",
  sex: "female",
  mrn: "100245",
  phone: "(508) 555-0142",
  email: "jane.doe@email.example",
  addressLine1: "14 Elm Street",
  city: "Worcester",
  state: "MA",
  postalCode: "01608",
  insurancePayer: null,
  insuranceMemberId: null,
};
