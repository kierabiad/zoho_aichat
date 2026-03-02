require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PORT = process.env.PORT || 3000;

// --- Gemini Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const systemInstruction = fs.readFileSync('./agents.md', 'utf8');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction });

// --- Bolt App (handles all Slack interactions on one port) ---

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});



receiver.app.post('/zoho-survey', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
  try {
    console.log("Survey webhook received:", req.body);

    const surveyData = req.body;

    // Format message cleanly
    const message = formatSurveyMessage(surveyData);

    let targetChannel = process.env.REVIEW_CHANNEL_ID || process.env.FEEDBACK_CHANNEL_ID;
    if (targetChannel && !targetChannel.startsWith('C') && !targetChannel.startsWith('#')) {
      targetChannel = '#' + targetChannel;
    }

    await app.client.chat.postMessage({
      channel: targetChannel, // #AI dump for now
      text: message,
    });

    res.status(200).send('Survey received');
  } catch (error) {
    console.error("Survey Error:", error);
    res.status(500).send('Error');
  }
});

function truncate(text, max = 300) {
  if (!text) return "";
  const str = String(text);
  return str.length > max
    ? str.substring(0, max) + "... (truncated)"
    : str;
}

function formatSurveyMessage(data) {
  const answers = data?.answers || data;

  let message = "📩 *New Survey Feedback*\n\n";

  for (const key in answers) {
    if (answers[key]) {
      message += `• *${key}*: ${truncate(answers[key])}\n`;
    }
  }

  return message;
}

// -------------------------------------------------------
// AI CHAT: Gemini message handler
// -------------------------------------------------------
app.message(async ({ message, say }) => {
  if (message.bot_id || message.subtype) return;

  const userText = message.text;
  console.log(`User said: ${userText}`);

  try {
    const chat = model.startChat({ history: [] });
    const result = await chat.sendMessage(userText);
    const responseText = result.response.text();

    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const aiData = JSON.parse(cleanJson);

    if (aiData.status === 'collecting') {
      await say(aiData.message_to_user);
    } else if (aiData.status === 'complete') {
      console.log('Submitting to Zoho...', aiData.extracted_data);
      await say('✅ Perfect! Submitting your request now.');
    }
  } catch (error) {
    console.error('AI Error:', error);
  }
});

// -------------------------------------------------------
// SLASH COMMAND: /request — opens Tech Request modal
// -------------------------------------------------------
app.command('/request', async ({ ack, body, client }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      callback_id: 'tech_request_form',
      type: 'modal',
      title: { type: 'plain_text', text: 'Tech Request Form', emoji: true },
      submit: { type: 'plain_text', text: 'Submit', emoji: true },
      close: { type: 'plain_text', text: 'Cancel', emoji: true },
      blocks: [
        {
          type: 'input', block_id: 'first_name_block',
          element: { type: 'plain_text_input', action_id: 'first_name_action' },
          label: { type: 'plain_text', text: 'First Name', emoji: true },
        },
        {
          type: 'input', block_id: 'last_name_block',
          element: { type: 'plain_text_input', action_id: 'last_name_action' },
          label: { type: 'plain_text', text: 'Last Name', emoji: true },
        },
        {
          type: 'input', block_id: 'department_block',
          element: {
            type: 'static_select', action_id: 'department_action',
            placeholder: { type: 'plain_text', text: 'What department are you from?', emoji: true },
            options: [
              { text: { type: 'plain_text', text: 'Admin', emoji: true }, value: 'admin' },
              { text: { type: 'plain_text', text: 'Customer Success Team', emoji: true }, value: 'cst' },  
              { text: { type: 'plain_text', text: 'Human Resource', emoji: true }, value: 'hr' },
              { text: { type: 'plain_text', text: 'Finance', emoji: true }, value: 'finance' },
              { text: { type: 'plain_text', text: 'Health', emoji: true }, value: 'health' },
            ],
          },
          label: { type: 'plain_text', text: 'Department', emoji: true },
        },
        {
          type: 'input', block_id: 'category_block',
          element: {
            type: 'static_select', action_id: 'category_action',
            placeholder: { type: 'plain_text', text: 'Select request type...', emoji: true },
            options: [
              { text: { type: 'plain_text', text: 'IT Support & Troubleshooting', emoji: true }, value: 'IT Support & Troubleshooting' },
              { text: { type: 'plain_text', text: 'Project-based', emoji: true }, value: 'Project-based' },
              { text: { type: 'plain_text', text: 'Compliance / Client Accreditation', emoji: true }, value: 'Compliance / Client Accreditation' },
              { text: { type: 'plain_text', text: 'Feature Request', emoji: true }, value: 'Feature Request' },
              { text: { type: 'plain_text', text: 'Training', emoji: true }, value: 'Training' },
              { text: { type: 'plain_text', text: 'Accounts and Access Management', emoji: true }, value: 'Accounts and Access Management' },
              { text: { type: 'plain_text', text: 'Data Reporting', emoji: true }, value: 'Data Reporting' },
              { text: { type: 'plain_text', text: 'Sessions', emoji: true }, value: 'Sessions' },
              { text: { type: 'plain_text', text: 'Other', emoji: true }, value: 'Other' },
            ],
          },
          label: { type: 'plain_text', text: 'Request Category', emoji: true },
          hint: { type: 'plain_text', text: "If your type of request isn't in the dropdown choices, you can select others and specify." },
        },
        {
          type: 'input', block_id: 'request_title_block',
          element: { type: 'plain_text_input', action_id: 'request_title_action' },
          label: { type: 'plain_text', text: 'Request', emoji: true },
          hint: { type: 'plain_text', text: 'Give a brief description or title of what the request is.' },
        },
        {
          type: 'input', block_id: 'details_block',
          element: { type: 'plain_text_input', multiline: true, action_id: 'details_action' },
          label: { type: 'plain_text', text: 'Details of the request', emoji: true },
          hint: { type: 'plain_text', text: 'Enter the details of your request for the Tech Team below. Please give information and data as much as possible and include links to any documentation, files, google docs, etc that would give us more information about the request.' },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*File Upload (Optional)*\nUpload any file that you need to share with the Tech Team to help out with the request.'
          }
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Request Impact Level*\n• *Critical Impact:* This request is essential for compliance, safety, or preventing significant operational disruptions.\n• *High Impact:* This request significantly affects multiple departments or the entire company, potentially leading to increased revenue, cost savings, or operational efficiency.\n• *Medium Impact:* This request affects a single department or a specific part of the company, with noticeable benefits such as improved processes or moderate cost savings.\n• *Low Impact:* This request has minimal impact, affecting a small team or a specific task, with limited overall benefits.\n• *No Impact:* This request does not have any noticeable effect on the company\'s operations, revenue, or costs.',
          },
        },
        {
          type: 'input', block_id: 'impact_level_block',
          element: {
            type: 'static_select', action_id: 'impact_level_action',
            placeholder: { type: 'plain_text', text: 'Select impact level...', emoji: true },
            options: [
              { text: { type: 'plain_text', text: 'Critical Impact', emoji: true }, value: 'Critical Impact' },
              { text: { type: 'plain_text', text: 'High Impact', emoji: true }, value: 'High Impact' },
              { text: { type: 'plain_text', text: 'Medium Impact', emoji: true }, value: 'Medium Impact' },
              { text: { type: 'plain_text', text: 'Low Impact', emoji: true }, value: 'Low Impact' },
              { text: { type: 'plain_text', text: 'No Impact', emoji: true }, value: 'No Impact' },
            ],
          },
          label: { type: 'plain_text', text: 'Request Impact Level', emoji: true },
        },
        {
          type: 'input', block_id: 'timeframe_block',
          element: {
            type: 'static_select', action_id: 'timeframe_action',
            placeholder: { type: 'plain_text', text: 'Select timeframe...', emoji: true },
            options: [
              { text: { type: 'plain_text', text: 'w/in 24 hours', emoji: true }, value: 'w/in 24 hours' },
              { text: { type: 'plain_text', text: '1 - 2 business days', emoji: true }, value: '1 - 2 business days' },
              { text: { type: 'plain_text', text: '3 - 5 business days', emoji: true }, value: '3 - 5 business days' },
              { text: { type: 'plain_text', text: '1 Week', emoji: true }, value: '1 Week' },
              { text: { type: 'plain_text', text: '2 Weeks', emoji: true }, value: '2 Weeks' },
            ],
          },
          label: { type: 'plain_text', text: 'Timeframe for resolution', emoji: true },
        },
        {
          type: 'input', block_id: 'meeting_request_block',
          element: {
            type: 'radio_buttons', action_id: 'meeting_request_action',
            options: [
              { text: { type: 'plain_text', text: 'Yes', emoji: true }, value: 'Yes' },
              { text: { type: 'plain_text', text: 'No', emoji: true }, value: 'No' },
            ],
          },
          label: { type: 'plain_text', text: 'Are you also requesting a meeting with the Tech Team for this?', emoji: true },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'If yes, the Tech Team will contact you via Slack to schedule a meeting.' }],
        },
      ],
    },
  });
});

// -------------------------------------------------------
// MODAL SUBMISSION: tech_request_form
// -------------------------------------------------------
app.view('tech_request_form', async ({ ack, body, view, client }) => {
  await ack();

  const v = view.state.values;
  const firstName  = v.first_name_block.first_name_action.value;
  const lastName   = v.last_name_block.last_name_action.value;
  const department = v.department_block.department_action.selected_option.text.text;
  const category   = v.category_block.category_action.selected_option.value;
  const title      = v.request_title_block.request_title_action.value;
  const description = v.details_block.details_action.value;
  const impact     = v.impact_level_block.impact_level_action.selected_option.value;
  const timeframe  = v.timeframe_block.timeframe_action.selected_option.value;
  const meeting    = v.meeting_request_block.meeting_request_action.selected_option.value;

  try {
    // Debug log the values
    console.log('Form values:', {
      firstName, lastName, department, category, title, description, impact, timeframe, meeting
    });
    
    // Build pre-filled Zoho Form URL (correct approach)
    const baseUrl = 'https://forms.zohopublic.com/mindyoumhs/form/TechRequestForm/formperma/eAa1mIKxZiOT7aXyRcf50TPRLdTS_bogpCW1fuDRJlU';
    
    const params = new URLSearchParams({
      'Name_First': firstName,
      'Name_Last': lastName,
      'Dropdown': department,
      'Dropdown2': category,
      'SingleLine': title,
      'MultiLine': description,
      'Dropdown1': impact,
      'Dropdown3': timeframe,
      'Radio': meeting,
    });

    const prefilledUrl = `${baseUrl}?${params.toString()}`;

    // Send pre-filled form link to user
    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Your Tech Request form is ready!\n\n<${prefilledUrl}|Click here to review and submit your request>\n\n*Note: You'll need to click "Submit" on the form page to finalize your request.*`,
    });

    // Notify review channel
    //await client.chat.postMessage({
      //channel: process.env.REVIEW_CHANNEL_ID,
      //text: `🔔 New Tech Request initiated by <@${body.user.id}>\nImpact: *${impact}*\n<@${process.env.REVIEW_USER_ID}> please monitor for submission.`,
    //});


  } catch (error) {
    console.error('Form URL Generation Error:', error.message);
    await client.chat.postMessage({
      channel: body.user.id,
      text: '❌ There was an error generating your form link. Please try again.',
    });
  }
});

// -------------------------------------------------------
// START
// -------------------------------------------------------
receiver.app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});