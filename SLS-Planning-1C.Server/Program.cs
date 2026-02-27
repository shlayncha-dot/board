using System.Text.Json.Serialization;
using SLS_Planning_1C.Server.Features.FileIndexing;
using SLS_Planning_1C.Server.Features.Naming;
using SLS_Planning_1C.Server.Features.Verification;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<IFileIndexStore, FileIndexStore>();
builder.Services.AddScoped<IVerificationService, VerificationService>();
builder.Services.AddSingleton<IVerificationSettingsStore, VerificationSettingsStore>();
builder.Services.AddHttpClient<INamingService, NamingService>();
builder.Services.AddSingleton<INamingCredentialsStore, NamingRuntimeCredentialsStore>();
builder.Services.Configure<NamingApiOptions>(builder.Configuration.GetSection("ExternalApis:Naming"));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");

app.Run();
