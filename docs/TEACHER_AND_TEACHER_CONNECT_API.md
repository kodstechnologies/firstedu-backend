# Teacher Management & Teacher Connect – API Reference (Postman)

**Base URL:** `http://localhost:YOUR_PORT` (e.g. `http://localhost:5000`)

- **Admin:** `/admin` — all require `Authorization: Bearer <admin_jwt>`
- **Teacher:** `/teacher` — login has no auth; others need teacher JWT
- **User (Apply for job):** `/user` — jobs/apply can be called without auth

---

## Part 1: Teacher Management (Admin)

### 1.1 Create Teacher  
`POST /admin/teachers`

**Auth:** Bearer token (admin)

**Content-Type:** `multipart/form-data` (if sending profile image) or `application/json`

**Body (form-data or JSON):**
| Key | Type | Required | Example |
|-----|------|----------|---------|
| name | string | Yes | Priya Sharma |
| email | string | Yes | priya@example.com |
| password | string | Yes (min 6) | SecurePass123 |
| gender | string | Yes | female (male/female/other) |
| about | string | No | Math and Science tutor |
| experience | string | No | 5 years |
| language | string | No | English, Hindi |
| hiringFor | string | No | fulltime (fulltime/internship/freelancing) |
| salaryPerMinute | number | No | 2.5 |
| skills | array or string | No | ["Mathematics","Physics"] or "Mathematics,Physics" |
| profileImage | file | No | image file |

**Example (JSON, no image):**
```json
{
  "name": "Priya Sharma",
  "email": "priya@example.com",
  "password": "SecurePass123",
  "gender": "female",
  "about": "Math and Science tutor",
  "experience": "5 years",
  "language": "English, Hindi",
  "hiringFor": "fulltime",
  "salaryPerMinute": 2.5,
  "skills": ["Mathematics", "Physics"]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "gender": "female",
    "about": "Math and Science tutor",
    "experience": "5 years",
    "language": "English, Hindi",
    "hiringFor": "fulltime",
    "perMinuteRate": 2.5,
    "skills": ["Mathematics", "Physics"],
    "profileImage": null,
    "status": "approved",
    "isLive": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Teacher created successfully"
}
```

---

### 1.2 Get All Teachers  
`GET /admin/teachers`

**Auth:** Bearer token (admin)

**Query params (optional):**
| Param | Type | Example |
|-------|------|---------|
| page | number | 1 |
| limit | number | 10 |
| search | string | Priya |
| status | string | approved (pending/approved/rejected) |
| sortBy | string | createdAt |
| sortOrder | string | desc |

**Example:**  
`GET /admin/teachers?page=1&limit=10&status=approved`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Priya Sharma",
      "email": "priya@example.com",
      "gender": "female",
      "about": "Math and Science tutor",
      "experience": "5 years",
      "language": "English, Hindi",
      "hiringFor": "fulltime",
      "perMinuteRate": 2.5,
      "skills": ["Mathematics", "Physics"],
      "profileImage": null,
      "status": "approved",
      "isLive": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "Teachers fetched successfully",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  }
}
```

---

### 1.3 Get Teacher by ID  
`GET /admin/teachers/:id`

**Auth:** Bearer token (admin)

**Example:**  
`GET /admin/teachers/64f1a2b3c4d5e6f7a8b9c0d1`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "gender": "female",
    "about": "Math and Science tutor",
    "experience": "5 years",
    "language": "English, Hindi",
    "hiringFor": "fulltime",
    "perMinuteRate": 2.5,
    "skills": ["Mathematics", "Physics"],
    "profileImage": null,
    "status": "approved",
    "isLive": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Teacher fetched successfully"
}
```

**Response (404):** Teacher not found

---

### 1.4 Update Teacher  
`PUT /admin/teachers/:id`

**Auth:** Bearer token (admin)

**Content-Type:** `application/json` or `multipart/form-data` (if profile image)

**Body (all optional):** name, email, password, gender, about, experience, language, hiringFor, salaryPerMinute, skills; optional file: profileImage

**Example:**  
`PUT /admin/teachers/64f1a2b3c4d5e6f7a8b9c0d1`
```json
{
  "name": "Priya Sharma (Updated)",
  "salaryPerMinute": 3,
  "skills": ["Mathematics", "Physics", "Chemistry"]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "_id": "...", "name": "Priya Sharma (Updated)", "perMinuteRate": 3, "skills": ["Mathematics", "Physics", "Chemistry"], ... },
  "message": "Teacher updated successfully"
}
```

---

### 1.5 Send Login Credentials to Teacher  
`POST /admin/teachers/:id/send-credentials`

**Auth:** Bearer token (admin)

**Body (JSON):**
```json
{
  "password": "WelcomeTeacher2024"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Login credentials sent to teacher email"
}
```
*(Email with login email + this password is sent to the teacher.)*

---

### 1.6 Approve Teacher  
`POST /admin/teachers/:id/approve`

**Auth:** Bearer token (admin)  
**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": { "_id": "...", "status": "approved", ... },
  "message": "Teacher approved successfully"
}
```

**Response (400):** Teacher is already approved

---

### 1.7 Reject Teacher  
`POST /admin/teachers/:id/reject`

**Auth:** Bearer token (admin)  
**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": { "_id": "...", "status": "rejected", ... },
  "message": "Teacher rejected successfully"
}
```

---

### 1.8 Update Per Minute Rate  
`PUT /admin/teachers/:id/rate`

**Auth:** Bearer token (admin)

**Body (JSON):**
```json
{
  "perMinuteRate": 2.5
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "_id": "...", "perMinuteRate": 2.5, ... },
  "message": "Per minute rate set successfully"
}
```

---

### 1.9 Delete Teacher  
`DELETE /admin/teachers/:id`

**Auth:** Bearer token (admin)  
**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Teacher deleted successfully"
}
```

**Response (404):** Teacher not found

---

## Part 2: Teacher Connect – Jobs (Admin)

### 2.1 Create Job  
`POST /admin/teacher-connect/jobs`

**Auth:** Bearer token (admin)

**Body (JSON):**
```json
{
  "title": "Math Tutor – Fulltime",
  "skills": ["Mathematics", "Algebra"],
  "experience": "2+ years",
  "hiringFor": "fulltime",
  "perMinuteRate": 2,
  "location": "Remote",
  "language": "English, Hindi"
}
```
- **hiringFor:** `fulltime` | `internship` | `freelancing`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "64f2b4c5d6e7f8a9b0c1d2e3",
    "title": "Math Tutor – Fulltime",
    "skills": ["Mathematics", "Algebra"],
    "experience": "2+ years",
    "hiringFor": "fulltime",
    "perMinuteRate": 2,
    "location": "Remote",
    "language": "English, Hindi",
    "createdBy": "64adminId...",
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "message": "Job created successfully"
}
```

---

### 2.2 Get All Jobs (Admin)  
`GET /admin/teacher-connect/jobs`

**Auth:** Bearer token (admin)

**Query params (optional):** page, limit, hiringFor

**Example:**  
`GET /admin/teacher-connect/jobs?page=1&limit=10&hiringFor=fulltime`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f2b4c5d6e7f8a9b0c1d2e3",
      "title": "Math Tutor – Fulltime",
      "skills": ["Mathematics", "Algebra"],
      "experience": "2+ years",
      "hiringFor": "fulltime",
      "perMinuteRate": 2,
      "location": "Remote",
      "language": "English, Hindi",
      "createdAt": "2024-01-15T11:00:00.000Z"
    }
  ],
  "message": "Jobs fetched successfully",
  "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
}
```

---

### 2.3 Get Job by ID (Admin)  
`GET /admin/teacher-connect/jobs/:id`

**Auth:** Bearer token (admin)

**Response (200):** Same shape as single job in 2.2

---

### 2.4 Update Job  
`PUT /admin/teacher-connect/jobs/:id`

**Auth:** Bearer token (admin)

**Body (JSON, all optional):** title, skills, experience, hiringFor, perMinuteRate, location

**Example:**
```json
{
  "title": "Senior Math Tutor – Fulltime",
  "perMinuteRate": 2.5
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "_id": "...", "title": "Senior Math Tutor – Fulltime", "perMinuteRate": 2.5, ... },
  "message": "Job updated successfully"
}
```

---

### 2.5 Delete Job  
`DELETE /admin/teacher-connect/jobs/:id`

**Auth:** Bearer token (admin)  
**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Job deleted successfully"
}
```

---

## Part 3: Teacher Connect – Applications (Admin)

### 3.1 Get All Applications  
`GET /admin/teacher-connect/applications`

**Auth:** Bearer token (admin)

**Query params (optional):** page, limit, jobId, status

**Example:**  
`GET /admin/teacher-connect/applications?page=1&limit=10&status=applied`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f3c6d7e8f9a0b1c2d3e4f5",
      "job": {
        "_id": "64f2b4c5d6e7f8a9b0c1d2e3",
        "title": "Math Tutor – Fulltime",
        "skills": ["Mathematics", "Algebra"],
        "experience": "2+ years",
        "hiringFor": "fulltime",
        "perMinuteRate": 2,
        "createdAt": "2024-01-15T11:00:00.000Z"
      },
      "name": "Rahul Kumar",
      "email": "rahul@example.com",
      "phone": "+919876543210",
      "resume": "https://res.cloudinary.com/.../resume.pdf",
      "status": "applied",
      "interviewDate": null,
      "interviewTime": null,
      "interviewProvider": null,
      "providerLink": null,
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "message": "Applications fetched successfully",
  "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
}
```

---

### 3.2 Get Application by ID  
`GET /admin/teacher-connect/applications/:id`

**Auth:** Bearer token (admin)

**Response (200):** Single application object (same shape as item in 3.1 list)

---

### 3.3 Schedule Interview  
`POST /admin/teacher-connect/applications/:id/schedule-interview`

**Auth:** Bearer token (admin)

**Body (JSON):**
```json
{
  "interviewDate": "2024-01-20",
  "interviewTime": "10:00 AM",
  "interviewProvider": "Google Meet",
  "providerLink": "https://meet.google.com/xxx-xxxx-xxx"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64f3c6d7e8f9a0b1c2d3e4f5",
    "status": "interview_scheduled",
    "interviewDate": "2024-01-20T00:00:00.000Z",
    "interviewTime": "10:00 AM",
    "interviewProvider": "Google Meet",
    "providerLink": "https://meet.google.com/xxx-xxxx-xxx",
    ...
  },
  "message": "Interview scheduled and email sent to candidate"
}
```
*(Candidate receives interview details by email.)*

---

### 3.4 Approve Application  
`POST /admin/teacher-connect/applications/:id/approve`

**Auth:** Bearer token (admin)  
**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64f3c6d7e8f9a0b1c2d3e4f5",
    "status": "approved",
    ...
  },
  "message": "Application approved; confirmation email sent to candidate"
}
```
*(No teacher account is created; only confirmation email is sent.)*

---

### 3.5 Reject Application  
`POST /admin/teacher-connect/applications/:id/reject`

**Auth:** Bearer token (admin)  
**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Application rejected; candidate removed and rejection email sent"
}
```
*(Application is deleted; rejection email is sent.)*

---

## Part 4: Teacher Connect – Jobs & Apply (Public / User)

### 4.1 Get All Jobs (Public)  
`GET /user/teacher-connect/jobs`

**Auth:** None required

**Query params (optional):** page, limit, hiringFor

**Example:**  
`GET /user/teacher-connect/jobs?page=1&limit=10&hiringFor=fulltime`

**Response (200):** Same structure as 2.2 (list of jobs with pagination)

---

### 4.2 Get Job by ID (Public)  
`GET /user/teacher-connect/jobs/:id`

**Auth:** None required

**Response (200):** Single job object

---

### 4.3 Apply for Job  
`POST /user/teacher-connect/apply`

**Auth:** None required

**Content-Type:** `multipart/form-data`

**Body (form-data):**
| Key | Type | Required | Example |
|-----|------|----------|---------|
| resume | file (PDF) | Yes | resume.pdf |
| jobId | string | Yes | 64f2b4c5d6e7f8a9b0c1d2e3 |
| name | string | Yes | Rahul Kumar |
| email | string | Yes | rahul@example.com |
| phone | string | Yes | +919876543210 |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "64f3c6d7e8f9a0b1c2d3e4f5",
    "job": "64f2b4c5d6e7f8a9b0c1d2e3",
    "name": "Rahul Kumar",
    "email": "rahul@example.com",
    "phone": "+919876543210",
    "resume": "https://res.cloudinary.com/.../resume.pdf",
    "status": "applied",
    "createdAt": "2024-01-15T12:00:00.000Z"
  },
  "message": "Application submitted successfully"
}
```

---

## Part 5: Teacher Portal (Teacher)

### 5.1 Login  
`POST /teacher/login`

**Auth:** None

**Body (JSON):**
```json
{
  "email": "priya@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Priya Sharma",
      "email": "priya@example.com",
      "gender": "female",
      "about": "Math and Science tutor",
      "experience": "5 years",
      "language": "English, Hindi",
      "hiringFor": "fulltime",
      "perMinuteRate": 2.5,
      "skills": ["Mathematics", "Physics"],
      "profileImage": null,
      "status": "approved",
      "isLive": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "message": "Teacher logged in successfully"
}
```
*(Cookies may also be set for accessToken/refreshToken.)*

**Response (403):** Account not approved (pending/rejected)

---

### 5.2 Logout  
`POST /teacher/logout`

**Auth:** Bearer token (teacher)

**Body:** none

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Teacher logged out successfully"
}
```

---

### 5.3 Forgot Password – Request OTP  
`POST /teacher/forgot-password/request`

**Auth:** None

**Body (JSON):**
```json
{
  "email": "priya@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "OTP has been sent to your email"
}
```

---

### 5.4 Forgot Password – Verify OTP  
`POST /teacher/forgot-password/verify`

**Auth:** None

**Body (JSON):**
```json
{
  "email": "priya@example.com",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "OTP verified. You can now set new password."
}
```

---

### 5.5 Forgot Password – Reset  
`POST /teacher/forgot-password/reset`

**Auth:** None

**Body (JSON):**
```json
{
  "email": "priya@example.com",
  "otp": "123456",
  "newPassword": "NewSecurePass123",
  "confirmPassword": "NewSecurePass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "Password reset successfully"
}
```

---

### 5.6 Change Password (Logged In)  
`PUT /teacher/change-password`

**Auth:** Bearer token (teacher)

**Body (JSON):**
```json
{
  "oldPassword": "SecurePass123",
  "newPassword": "NewSecurePass456",
  "confirmPassword": "NewSecurePass456"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "Password changed successfully"
}
```

---

### 5.7 Update Profile (Teacher)  
`PUT /teacher/profile`

**Auth:** Bearer token (teacher)

**Content-Type:** `application/json` or `multipart/form-data` (if profile image)

**Body (all optional):** name, email, gender, about; optional file: profileImage

**Example (JSON):**
```json
{
  "name": "Priya Sharma",
  "email": "priya.new@example.com",
  "gender": "female",
  "about": "Experienced Math and Science tutor"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "_id": "...", "name": "Priya Sharma", "email": "priya.new@example.com", ... },
  "message": "Profile updated successfully"
}
```

---

## Postman quick reference

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| POST | /admin/teachers | Admin | Create teacher |
| GET | /admin/teachers | Admin | List teachers |
| GET | /admin/teachers/:id | Admin | Get teacher |
| PUT | /admin/teachers/:id | Admin | Update teacher |
| POST | /admin/teachers/:id/send-credentials | Admin | Email login credentials |
| POST | /admin/teachers/:id/approve | Admin | Approve teacher |
| POST | /admin/teachers/:id/reject | Admin | Reject teacher |
| PUT | /admin/teachers/:id/rate | Admin | Update per-minute rate |
| DELETE | /admin/teachers/:id | Admin | Delete teacher |
| POST | /admin/teacher-connect/jobs | Admin | Create job |
| GET | /admin/teacher-connect/jobs | Admin | List jobs |
| GET | /admin/teacher-connect/jobs/:id | Admin | Get job |
| PUT | /admin/teacher-connect/jobs/:id | Admin | Update job |
| DELETE | /admin/teacher-connect/jobs/:id | Admin | Delete job |
| GET | /admin/teacher-connect/applications | Admin | List applications |
| GET | /admin/teacher-connect/applications/:id | Admin | Get application |
| POST | /admin/teacher-connect/applications/:id/schedule-interview | Admin | Schedule interview |
| POST | /admin/teacher-connect/applications/:id/approve | Admin | Approve application |
| POST | /admin/teacher-connect/applications/:id/reject | Admin | Reject application |
| GET | /user/teacher-connect/jobs | No | List jobs (public) |
| GET | /user/teacher-connect/jobs/:id | No | Get job (public) |
| POST | /user/teacher-connect/apply | No | Apply for job (multipart) |
| POST | /teacher/login | No | Teacher login |
| POST | /teacher/logout | Teacher | Logout |
| POST | /teacher/forgot-password/request | No | Request OTP |
| POST | /teacher/forgot-password/verify | No | Verify OTP |
| POST | /teacher/forgot-password/reset | No | Reset password |
| PUT | /teacher/change-password | Teacher | Change password |
| PUT | /teacher/profile | Teacher | Update profile |

---

## Error response shape

All errors typically return:

```json
{
  "success": false,
  "message": "Error message here",
  "errors": ["optional validation messages"]
}
```

Status codes: 400 (validation/bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict, e.g. duplicate email), 500 (server error).
