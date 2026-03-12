async function main () {
    const user = {
        account_id: '44xxxx2',
        hash_cid: '02xxxxd1',
        provider_id: '071xxxxB0',
        title_th: 'นาย',
        special_title_th: 'อื่นๆ',
        name_th: 'xxxx xxxx',
        name_eng: 'xxxxx xxxx',
        created_at: '2025-03-28T03:09:32.000Z',
        title_en: 'Mr.',
        special_title_en: 'Other',
        firstname_th: 'xxxx',
        lastname_th: 'xxxx',
        firstname_en: 'xxxx',
        lastname_en: 'xxxx',
        email: 'xxxx@yyy.com',
        date_of_birth: 'xxxx-xx-xx',
        organization: [
            {
                business_id: '3405xxxxxxx364',
                position: 'นักวิชาการคอมพิวเตอร์',
                position_id: '0007',
                affiliation: 'นักวิชาการคอมพิวเตอร์',
                license_id: '',
                hcode: '4xxxx0',
                code9: '00xxxx00',
                hcode9: 'IA00xxxx0',
                level: '6',
                hname_th: 'สำนักสุขภาพดิจิทัล',
                hname_eng: 'Bureau of Digital Health',
                tax_id: '2885556200792',
                license_expired_date: null,
                license_id_verify: false,
                expertise: null,
                expertise_id: null,
                moph_station_ref_code: '6300000001',
                is_private_provider: false,
                address: [Object],
                moph_access_token_idp: ''
            }
        ]
    }

    const formData = new FormData();
    formData.append('service_start_time', '2025-12-10T09:00:00+07:00');
    formData.append('service_end_time', '2025-12-10T09:30:00+07:00');
    formData.append('health_id', '176xxxxxxxxxx000');
    formData.append('provider_ids', 'DOC001');
    formData.append('provider_ids', 'DOC002');
    formData.append('clinic_code_43files', '005');
    formData.append('clinic_code_specialty', '055');
    formData.append('medical_specialty_code', '05');
    formData.append('hcode_5', user.organization[0].hcode5);
    formData.append('hcode_9', user.organization[0].hcode9);
    formData.append('appointment_id', 'APT-012345');
    formData.append('files', new File([''], '/C:/Users/20251212_062652_Telemed.mp3')); // Replace with actual file
    formData.append('visit_number', 'VN-001');
    formData.append('patient_cid', '1234567890123');

    fetch('https://ai-telemedicine.abs.co.th/api/media', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer eyJ0e...' // Replace with actual token
        },
        body: formData
    })
        .then(response => response.json())
        .then(data => console.log(data))
        .catch(error => console.error('Error:', error));
}

if (require.main === module) {
    main();
}
