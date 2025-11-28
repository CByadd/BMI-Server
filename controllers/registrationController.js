const prisma = require('../db');

// Create registration
exports.createRegistration = async (req, res) => {
  try {
    const { personalInfo, businessInfo, oauthData } = req.body;

    if (!personalInfo || !businessInfo) {
      return res.status(400).json({ error: 'Personal and business information are required' });
    }

    // Parse JSON strings if needed
    const personalInfoObj = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : personalInfo;
    const businessInfoObj = typeof businessInfo === 'string' ? JSON.parse(businessInfo) : businessInfo;
    const oauthDataObj = oauthData ? (typeof oauthData === 'string' ? JSON.parse(oauthData) : oauthData) : null;

    // Process uploaded files (simplified - in production upload to Cloudinary)
    const documents = {};
    if (req.files) {
      for (const key of Object.keys(req.files)) {
        const fieldName = key.replace('documents[', '').replace(']', '');
        const file = req.files[key][0];
        documents[fieldName] = `https://placeholder.com/${file.filename}`;
      }
    }

    // Check if email already exists
    const existing = await prisma.$queryRaw`
      SELECT id FROM registrations
      WHERE personal_info->>'email' = ${personalInfoObj.email}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Insert registration
    const result = await prisma.$queryRaw`
      INSERT INTO registrations (
        personal_info, business_info, documents, status, submitted_at
      )
      VALUES (
        ${JSON.stringify(personalInfoObj)}::jsonb,
        ${JSON.stringify(businessInfoObj)}::jsonb,
        ${JSON.stringify(documents)}::jsonb,
        'PENDING',
        NOW()
      )
      RETURNING id
    `;

    res.status(201).json({
      id: result[0].id,
      message: 'Registration submitted successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to submit registration' });
  }
};

// Get all registrations
exports.getAllRegistrations = async (req, res) => {
  try {
    const registrations = await prisma.$queryRaw`
      SELECT * FROM registrations
      ORDER BY submitted_at DESC
    `;

    res.json(registrations);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
};

// Get registration by ID
exports.getRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;
    const registrations = await prisma.$queryRaw`
      SELECT * FROM registrations WHERE id = ${parseInt(id)}
    `;

    if (registrations.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json(registrations[0]);
  } catch (error) {
    console.error('Error fetching registration:', error);
    res.status(500).json({ error: 'Failed to fetch registration' });
  }
};

// Approve registration
exports.approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    // Get registration
    const registrations = await prisma.$queryRaw`
      SELECT * FROM registrations WHERE id = ${parseInt(id)}
    `;

    if (registrations.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const registration = registrations[0];
    if (registration.status !== 'PENDING') {
      return res.status(400).json({ error: 'Registration is not pending' });
    }

    // Update registration status
    await prisma.$queryRaw`
      UPDATE registrations
      SET status = 'APPROVED', updated_at = NOW()
      WHERE id = ${parseInt(id)}
    `;

    // Create publisher account (simplified)
    const personalInfo = registration.personal_info;
    const businessInfo = registration.business_info;

    await prisma.$queryRaw`
      INSERT INTO publishers (
        name, email, phone, location, status, join_date,
        company_name, business_type, address, city, state, pincode
      )
      VALUES (
        ${personalInfo.firstName + ' ' + personalInfo.lastName},
        ${personalInfo.email},
        ${personalInfo.phone},
        ${businessInfo.city + ', ' + businessInfo.state},
        'active',
        NOW(),
        ${businessInfo.companyName},
        ${businessInfo.businessType},
        ${businessInfo.address},
        ${businessInfo.city},
        ${businessInfo.state},
        ${businessInfo.pincode}
      )
      ON CONFLICT (email) DO NOTHING
    `;

    res.json({ message: 'Registration approved and publisher account created' });
  } catch (error) {
    console.error('Error approving registration:', error);
    res.status(500).json({ error: 'Failed to approve registration' });
  }
};

// Reject registration
exports.rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const registrations = await prisma.$queryRaw`
      SELECT * FROM registrations WHERE id = ${parseInt(id)}
    `;

    if (registrations.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (registrations[0].status !== 'PENDING') {
      return res.status(400).json({ error: 'Registration is not pending' });
    }

    await prisma.$queryRaw`
      UPDATE registrations
      SET status = 'REJECTED',
          rejection_reason = ${rejectionReason},
          updated_at = NOW()
      WHERE id = ${parseInt(id)}
    `;

    res.json({ message: 'Registration rejected successfully' });
  } catch (error) {
    console.error('Error rejecting registration:', error);
    res.status(500).json({ error: 'Failed to reject registration' });
  }
};

// Get registration status by email
exports.getRegistrationStatus = async (req, res) => {
  try {
    const { email } = req.params;
    const registrations = await prisma.$queryRaw`
      SELECT id, status, rejection_reason, submitted_at
      FROM registrations
      WHERE personal_info->>'email' = ${email}
      ORDER BY submitted_at DESC
      LIMIT 1
    `;

    if (registrations.length === 0) {
      return res.status(404).json({ error: 'No registration found for this email' });
    }

    res.json({
      id: registrations[0].id,
      status: registrations[0].status,
      rejectionReason: registrations[0].rejection_reason,
      submittedAt: registrations[0].submitted_at
    });
  } catch (error) {
    console.error('Error fetching registration status:', error);
    res.status(500).json({ error: 'Failed to fetch registration status' });
  }
};



