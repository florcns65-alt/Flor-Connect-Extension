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
