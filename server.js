require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { App } = require('@slack/bolt');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PORT = process.env.PORT || 3000;

// --- Gemini Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const systemInstruction = fs.readFileSync('./agents.md', 'utf8');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction });

// --- Bolt App (handles all Slack interactions on one port) ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  port: PORT,
});

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
              { text: { type: 'plain_text', text: 'IT Support & Troubleshooting', emoji: true }, value: 'itst' },
              { text: { type: 'plain_text', text: 'Software Issue', emoji: true }, value: 'software' },
              { text: { type: 'plain_text', text: 'Access Request', emoji: true }, value: 'access' },
              { text: { type: 'plain_text', text: 'Other', emoji: true }, value: 'other' },
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
              { text: { type: 'plain_text', text: 'Critical Impact', emoji: true }, value: 'critical' },
              { text: { type: 'plain_text', text: 'High Impact', emoji: true }, value: 'high' },
              { text: { type: 'plain_text', text: 'Medium Impact', emoji: true }, value: 'medium' },
              { text: { type: 'plain_text', text: 'Low Impact', emoji: true }, value: 'low' },
              { text: { type: 'plain_text', text: 'No Impact', emoji: true }, value: 'no_impact' },
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
              { text: { type: 'plain_text', text: 'ASAP', emoji: true }, value: 'asap' },
              { text: { type: 'plain_text', text: 'Within 24 Hours', emoji: true }, value: '24_hours' },
              { text: { type: 'plain_text', text: 'Within 1 Week', emoji: true }, value: '1_week' },
            ],
          },
          label: { type: 'plain_text', text: 'Timeframe for resolution', emoji: true },
        },
        {
          type: 'input', block_id: 'meeting_request_block',
          element: {
            type: 'radio_buttons', action_id: 'meeting_request_action',
            options: [
              { text: { type: 'plain_text', text: 'Yes', emoji: true }, value: 'yes' },
              { text: { type: 'plain_text', text: 'No', emoji: true }, value: 'no' },
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
  const category   = v.category_block.category_action.selected_option.text.text;
  const title      = v.request_title_block.request_title_action.value;
  const description = v.details_block.details_action.value;
  const impact     = v.impact_level_block.impact_level_action.selected_option.text.text;
  const timeframe  = v.timeframe_block.timeframe_action.selected_option.text.text;
  const meeting    = v.meeting_request_block.meeting_request_action.selected_option.text.text;

  try {
    // Step 1: Get Zoho Access Token
    const tokenResponse = await axios.post(
      'https://accounts.zoho.com/oauth/v2/token',
      null,
      {
        params: {
          refresh_token: process.env.ZOHO_REFRESH_TOKEN,
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          grant_type: 'refresh_token',
        },
      }
    );
    const accessToken = tokenResponse.data.access_token;

    // Step 2: Extract form link name from URL
    const zohoFormUrl = process.env.ZOHO_FORM_LINK_NAME;
    const formLinkName = zohoFormUrl.includes('/form/')
      ? zohoFormUrl.split('/form/')[1].split('/')[0]
      : zohoFormUrl;

    // Step 3: Submit to Zoho Form
    await axios.post(
      `https://forms.zoho.com/api/v1/forms/${formLinkName}/submissions`,
      {
        data: {
          'First Name': firstName,
          'Last Name': lastName,
          'Department': department,
          'Category': category,
          'Request Title': title,
          'Description': description,
          'Impact Level': impact,
          'Timeframe': timeframe,
          'Meeting Requested': meeting,
        },
      },
      { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
    );

    // Step 4: Confirm to user
    await client.chat.postMessage({
      channel: body.user.id,
      text: '✅ Your Tech Request has been submitted successfully!',
    });

    // Step 5: Notify review channel
    await client.chat.postMessage({
      channel: process.env.REVIEW_CHANNEL_ID,
      text: `🔔 New Tech Request from <@${body.user.id}>\nImpact: *${impact}*\n<@${process.env.REVIEW_USER_ID}> please review.`,
    });

  } catch (error) {
    console.error('Zoho Submission Error:', error.response ? error.response.data : error.message);
    await client.chat.postMessage({
      channel: body.user.id,
      text: '❌ There was an error submitting your request to Zoho. Please try again.',
    });
  }
});

// -------------------------------------------------------
// START
// -------------------------------------------------------
(async () => {
  await app.start();
  console.log(`🚀 Server running on port ${PORT}`);
})();