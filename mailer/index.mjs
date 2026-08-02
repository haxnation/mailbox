import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Initialize SES client
const sesClient = new SESClient({ 
  region: "ap-south-1" // Using your region from the URL
});

export const handler = async (event) => {
  // Check origin for security - only allow haxnation.org and subdomains
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigins = [
    'https://haxnation.org',
    'https://www.haxnation.org',
    'https://a-y-u-s-h-y-a.github.io'
  ];
  
  // Check if origin matches haxnation.org or any subdomain
  const isAllowedOrigin = allowedOrigins.includes(origin) || 
    (origin.startsWith('https://') && origin.endsWith('.haxnation.org'));

  if (!isAllowedOrigin && origin) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'text/plain'
      },
      body: 'Forbidden: Invalid origin'
    };
  }

  // Set CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': origin || 'https://haxnation.org',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'text/plain'
  };

  // Get HTTP method from Lambda Function URL event structure
  const httpMethod = event.requestContext?.http?.method || event.httpMethod;

  // Handle preflight OPTIONS request
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST method
  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: 'Method Not Allowed'
    };
  }

  try {
    let formData = {};

    // Parse form data based on content type
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data (FormData from frontend)
      const boundaryMatch = contentType.match(/boundary=([^;]+)/);
      if (!boundaryMatch) {
        throw new Error('No boundary found in multipart data');
      }
      
      const boundary = boundaryMatch[1];
      const body = event.isBase64Encoded ? 
        Buffer.from(event.body, 'base64').toString() : 
        event.body;
      
      formData = parseMultipartFormData(body, boundary);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Handle URL encoded form data
      const body = event.isBase64Encoded ? 
        Buffer.from(event.body, 'base64').toString() : 
        event.body;
      
      formData = parseUrlEncodedFormData(body);
    } else {
      // Try to parse as JSON
      formData = JSON.parse(event.body);
    }

    // Extract form fields
    const { name, email, subject, message } = formData;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return {
        statusCode: 400,
        headers,
        body: 'All fields are required'
      };
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: 'Invalid email address'
      };
    }

    // Create email content with proper IP and details
    const senderIP = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || 'Unknown';
    const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || 'Unknown';
    const referer = event.headers?.referer || event.headers?.Referer || 'Unknown';
    
    const emailBody = `
New Contact Form Submission

Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}

---
Technical Details:
Sender IP: ${senderIP}
User Agent: ${userAgent}
Referer: ${referer}
Origin: ${origin}
Timestamp: ${new Date().toISOString()}
Request ID: ${event.requestContext?.requestId || 'Unknown'}

This email was sent from your website contact form at haxnation.org
    `.trim();

    // SES email parameters
    const emailParams = {
      Source: 'noreply@haxnation.org', // Must be verified in SES
      Destination: {
        ToAddresses: ['corphaxnation@gmail.com']
      },
      Message: {
        Subject: {
          Data: `Contact Form: ${subject}`,
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: emailBody,
            Charset: 'UTF-8'
          }
        }
      },
      ReplyToAddresses: [email] // Allow replying directly to the sender
    };

    // Send email via SES
    const command = new SendEmailCommand(emailParams);
    const result = await sesClient.send(command);

    console.log('Email sent successfully:', result.MessageId);

    return {
      statusCode: 200,
      headers,
      body: 'Thank you for your message! We\'ll get back to you soon.'
    };

  } catch (error) {
    console.error('Error processing request:', error);
    
    return {
      statusCode: 500,
      headers,
      body: 'Error sending message. Please try again later.'
    };
  }
};

// Helper function to parse multipart form data
function parseMultipartFormData(body, boundary) {
  const formData = {};
  const parts = body.split(`--${boundary}`);
  
  for (const part of parts) {
    if (part.includes('Content-Disposition: form-data')) {
      const nameMatch = part.match(/name="([^"]+)"/);
      if (nameMatch) {
        const fieldName = nameMatch[1];
        const valueStartIndex = part.indexOf('\r\n\r\n') + 4;
        const valueEndIndex = part.lastIndexOf('\r\n');
        const value = part.substring(valueStartIndex, valueEndIndex);
        formData[fieldName] = value;
      }
    }
  }
  
  return formData;
}

// Helper function to parse URL encoded form data
function parseUrlEncodedFormData(body) {
  const formData = {};
  const pairs = body.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      formData[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  
  return formData;
}